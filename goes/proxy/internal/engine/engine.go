package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/gpu"
	k8sutil "github.com/openroute/goes/proxy/internal/k8s"
	"github.com/openroute/goes/proxy/internal/platform"
	"github.com/openroute/goes/proxy/internal/ssh"
	"github.com/openroute/goes/proxy/internal/state"
)

type StageFn func(ctx context.Context, task state.Task, payload interface{}) state.StageResult

type Engine struct {
	cfg      *config.Config
	store    *state.Store
	platform *platform.Client
	ssh      *ssh.Client
	k8s      *k8sutil.Client
	logger   *slog.Logger
	taskCh   chan state.Task
}

func New(cfg *config.Config, store *state.Store, platformClient *platform.Client, sshClient *ssh.Client, k8sClient *k8sutil.Client, logger *slog.Logger) *Engine {
	return &Engine{
		cfg:      cfg,
		store:    store,
		platform: platformClient,
		ssh:      sshClient,
		k8s:      k8sClient,
		logger:   logger,
		taskCh:   make(chan state.Task, 100),
	}
}

func (e *Engine) Enqueue(task state.Task) {
	e.taskCh <- task
}

func (e *Engine) Start(ctx context.Context) {
	e.logger.Info("engine started")
	for {
		select {
		case <-ctx.Done():
			e.logger.Info("engine stopped")
			return
		case task := <-e.taskCh:
			e.executeTask(ctx, task)
		}
	}
}

func (e *Engine) executeTask(ctx context.Context, task state.Task) {
	e.logger.Info("task_started", "task_id", task.ID, "type", task.Type, "device_sn", e.extractDeviceSN(task))

	if err := e.store.UpdateTaskStatus(task.ID, state.TaskStatusRunning, "", ""); err != nil {
		e.logger.Error("failed to update task status", "task_id", task.ID, "error", err)
		return
	}

	var stages []state.StageResult
	var finalErr string

	switch task.Type {
	case state.TaskTypeDeviceOnboard:
		stages, finalErr = e.runOnboard(ctx, task)
	case state.TaskTypeDeviceOffboard:
		stages, finalErr = e.runOffboard(ctx, task)
	default:
		finalErr = fmt.Sprintf("unknown task type: %s", task.Type)
	}

	stagesJSON, _ := json.Marshal(stages)

	var status state.TaskStatus
	if finalErr != "" {
		status = state.TaskStatusFailed
	} else {
		status = state.TaskStatusCompleted
	}

	if err := e.store.UpdateTaskStatus(task.ID, status, string(stagesJSON), finalErr); err != nil {
		e.logger.Error("failed to update final task status", "task_id", task.ID, "error", err)
	}

	_ = e.store.WriteAuditLog(task.ID, string(status), finalErr)

	_ = e.platform.ReportTaskResult(task.ID, platform.TaskUpdateRequest{
		Status: string(status),
		Stages: stages,
		Error:  finalErr,
	})

	e.logger.Info("task_completed", "task_id", task.ID, "status", status, "stages", len(stages))
}

func (e *Engine) runOnboard(ctx context.Context, task state.Task) ([]state.StageResult, string) {
	var payload state.OnboardPayload
	if err := json.Unmarshal(task.Payload, &payload); err != nil {
		return nil, fmt.Sprintf("unmarshal payload: %v", err)
	}

	stages := []struct {
		name string
		fn   StageFn
	}{
		{"ssh_verify", e.sshVerifyStage},
		{"gpu_check", e.gpuCheckStage},
		{"env_init", e.envInitStage},
		{"k8s_join", e.k8sJoinStage},
		{"gpu_label", e.gpuLabelStage},
	}

	var results []state.StageResult
	for _, s := range stages {
		start := time.Now()
		result := s.fn(ctx, task, payload)
		result.DurationMs = time.Since(start).Milliseconds()
		result.Stage = s.name

		results = append(results, result)

		e.logger.Info("stage_completed",
			"task_id", task.ID,
			"stage", s.name,
			"status", result.Status,
			"duration_ms", result.DurationMs,
		)

		_ = e.store.WriteAuditLog(task.ID, s.name, result.Status)

		if result.Status == "failed" {
			return results, fmt.Sprintf("stage %s failed: %s", s.name, result.Error)
		}
	}

	return results, ""
}

func (e *Engine) runOffboard(ctx context.Context, task state.Task) ([]state.StageResult, string) {
	var payload state.OffboardPayload
	if err := json.Unmarshal(task.Payload, &payload); err != nil {
		return nil, fmt.Sprintf("unmarshal payload: %v", err)
	}

	if e.k8s == nil || !e.k8s.IsReachable() {
		return nil, "k8s client not available"
	}

	stages := []struct {
		name string
		fn   StageFn
	}{
		{"cordon", e.cordonStage},
		{"drain", e.drainStage},
		{"delete_node", e.deleteNodeStage},
	}

	var results []state.StageResult
	for _, s := range stages {
		start := time.Now()
		result := s.fn(ctx, task, payload)
		result.DurationMs = time.Since(start).Milliseconds()
		result.Stage = s.name

		results = append(results, result)

		if result.Status == "failed" {
			return results, fmt.Sprintf("stage %s failed: %s", s.name, result.Error)
		}
	}

	return results, ""
}

func (e *Engine) extractDeviceSN(task state.Task) string {
	switch task.Type {
	case state.TaskTypeDeviceOnboard:
		var p state.OnboardPayload
		json.Unmarshal(task.Payload, &p)
		return p.DeviceSN
	case state.TaskTypeDeviceOffboard:
		var p state.OffboardPayload
		json.Unmarshal(task.Payload, &p)
		return p.DeviceSN
	}
	return ""
}

// Stage implementations

func (e *Engine) sshVerifyStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OnboardPayload)

	client, err := e.ssh.Dial(p.InternalIP, p.SSHUsername, p.SSHPassword)
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("SSH connect failed: %v", err)}
	}
	defer client.Close()

	output, err := e.ssh.RunCommand(client, "uname -a && cat /etc/os-release 2>/dev/null | head -5")
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("OS detection failed: %v", err)}
	}

	return state.StageResult{
		Status: "success",
		Output: map[string]interface{}{"system_info": output},
	}
}

func (e *Engine) gpuCheckStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OnboardPayload)

	client, err := e.ssh.Dial(p.InternalIP, p.SSHUsername, p.SSHPassword)
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("SSH connect failed: %v", err)}
	}
	defer client.Close()

	output, err := e.ssh.RunCommand(client, "nvidia-smi --query-gpu=name,count,memory.total --format=csv,noheader 2>/dev/null || echo 'NO_GPU'")
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("GPU detection failed: %v", err)}
	}

	if strings.TrimSpace(output) == "NO_GPU" {
		return state.StageResult{Status: "failed", Error: "nvidia-smi not found or no GPUs detected"}
	}

	gpus := gpu.ParseNvidiaSmi(output)
	if err := gpu.GPUCheck(gpus, p.GPUCardType, p.ExpectedGPUCount); err != nil {
		return state.StageResult{Status: "failed", Error: err.Error()}
	}

	_ = e.store.SaveDeviceCache(state.DeviceCache{
		SN:        p.DeviceSN,
		InternalIP: p.InternalIP,
		GPUType:   p.GPUCardType,
		GPUCount:  p.ExpectedGPUCount,
		UpdatedAt: time.Now().Format(time.RFC3339),
	})

	return state.StageResult{
		Status: "success",
		Output: map[string]interface{}{"gpus": gpus, "count": gpu.TotalCount(gpus)},
	}
}

func (e *Engine) envInitStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OnboardPayload)

	client, err := e.ssh.Dial(p.InternalIP, p.SSHUsername, p.SSHPassword)
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("SSH connect failed: %v", err)}
	}
	defer client.Close()

	// Detect OS
	osOutput, _ := e.ssh.RunCommand(client, "cat /etc/os-release 2>/dev/null | grep ^ID= | cut -d= -f2 | tr -d '\"'")
	osID := strings.ToLower(strings.TrimSpace(osOutput))

	initScript := e.selectInitScript(osID)

	// Upload and run init script
	if err := e.ssh.UploadFile(client, "/tmp/openroute-init.sh", []byte(initScript)); err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("upload init script: %v", err)}
	}

	output, err := e.ssh.RunCommand(client, "chmod +x /tmp/openroute-init.sh && sudo /tmp/openroute-init.sh")
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("env init failed: %v", err)}
	}

	return state.StageResult{
		Status: "success",
		Output: map[string]interface{}{"os": osID, "output": output},
	}
}

func (e *Engine) k8sJoinStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OnboardPayload)

	client, err := e.ssh.Dial(p.InternalIP, p.SSHUsername, p.SSHPassword)
	if err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("SSH connect failed: %v", err)}
	}
	defer client.Close()

	joinCmd := fmt.Sprintf("sudo kubeadm join %s --token %s --discovery-token-ca-cert-hash sha256:%s",
		p.TargetClusterEndpoint, p.KubeadmToken, p.KubeadmCAHash)

	output, err := e.ssh.RunCommand(client, joinCmd)
	if err != nil {
		// Try reset and retry
		_, _ = e.ssh.RunCommand(client, "sudo kubeadm reset -f")
		output, err = e.ssh.RunCommand(client, joinCmd)
		if err != nil {
			return state.StageResult{Status: "failed", Error: fmt.Sprintf("kubeadm join failed: %v\n%s", err, output)}
		}
	}

	// Wait for node ready
	nodeName := p.DeviceSN
	timeout := time.Duration(e.cfg.Health.NodeReadyTimeout) * time.Second
	if e.k8s != nil && e.k8s.IsReachable() {
		if err := e.k8s.WaitNodeReady(ctx, nodeName, timeout); err != nil {
			return state.StageResult{Status: "failed", Error: err.Error()}
		}
	}

	return state.StageResult{
		Status: "success",
		Output: map[string]interface{}{"node_name": nodeName, "join_output": output},
	}
}

func (e *Engine) gpuLabelStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OnboardPayload)

	if e.k8s == nil || !e.k8s.IsReachable() {
		return state.StageResult{Status: "skipped", Output: map[string]interface{}{"reason": "k8s not available"}}
	}

	nodeName := p.DeviceSN
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	for k, v := range p.NodeLabels {
		if err := e.k8s.LabelNode(ctx, nodeName, k, v); err != nil {
			e.logger.Warn("failed to label node", "node", nodeName, "key", k, "error", err)
		}
	}

	gpuLabels := map[string]string{
		"nvidia.com/gpu.present": "true",
		"nvidia.com/gpu.count":   gpu.GPUCountLabel(p.ExpectedGPUCount),
		"nvidia.com/gpu.product": p.GPUCardType,
	}
	for k, v := range gpuLabels {
		_ = e.k8s.LabelNode(ctx, nodeName, k, v)
	}

	return state.StageResult{
		Status: "success",
		Output: map[string]interface{}{"node_name": nodeName},
	}
}

// Offboard stages

func (e *Engine) cordonStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OffboardPayload)
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := e.k8s.CordonNode(ctx, p.NodeName); err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("cordon failed: %v", err)}
	}
	return state.StageResult{Status: "success"}
}

func (e *Engine) drainStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OffboardPayload)
	timeout := time.Duration(p.DrainTimeoutSecs) * time.Second

	if err := e.k8s.DrainNode(ctx, p.NodeName, timeout, p.Force); err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("drain failed: %v", err)}
	}
	return state.StageResult{Status: "success"}
}

func (e *Engine) deleteNodeStage(ctx context.Context, task state.Task, payload interface{}) state.StageResult {
	p := payload.(state.OffboardPayload)
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	if err := e.k8s.DeleteNode(ctx, p.NodeName); err != nil {
		return state.StageResult{Status: "failed", Error: fmt.Sprintf("delete node failed: %v", err)}
	}
	return state.StageResult{Status: "success"}
}

func (e *Engine) selectInitScript(osID string) string {
	switch {
	case strings.Contains(osID, "ubuntu"):
		return ubuntuInitScript
	case strings.Contains(osID, "centos"):
		return centosInitScript
	case strings.Contains(osID, "rocky"):
		return rockyInitScript
	default:
		return genericInitScript
	}
}

// Minimal init scripts (placeholders — real scripts would be much longer)

const ubuntuInitScript = `#!/bin/bash
set -euo pipefail
apt-get update -qq
apt-get install -y -qq curl jq
echo "env_init complete (ubuntu)"
`

const centosInitScript = `#!/bin/bash
set -euo pipefail
yum install -y -q curl jq
echo "env_init complete (centos)"
`

const rockyInitScript = `#!/bin/bash
set -euo pipefail
dnf install -y -q curl jq
echo "env_init complete (rocky)"
`

const genericInitScript = `#!/bin/bash
set -euo pipefail
echo "env_init complete (generic)"
`
