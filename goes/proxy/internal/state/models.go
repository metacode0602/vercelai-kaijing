package state

import (
	"encoding/json"
	"time"
)

type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
)

type TaskType string

const (
	TaskTypeDeviceOnboard  TaskType = "device_onboard"
	TaskTypeDeviceOffboard TaskType = "device_offboard"
)

type Task struct {
	ID           string            `json:"id"`
	Type         TaskType          `json:"type"`
	Status       TaskStatus        `json:"status"`
	Priority     int               `json:"priority"`
	Payload      json.RawMessage   `json:"payload"`
	StagesJSON   string            `json:"stages_json,omitempty"`
	RetryCount   int               `json:"retry_count"`
	MaxRetries   int               `json:"max_retries"`
	Error        string            `json:"error,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	StartedAt    *time.Time        `json:"started_at,omitempty"`
	FinishedAt   *time.Time        `json:"finished_at,omitempty"`
}

type OnboardPayload struct {
	DeviceSN             string            `json:"device_sn"`
	InternalIP           string            `json:"internal_ip"`
	SSHUsername          string            `json:"ssh_username"`
	SSHPassword          string            `json:"ssh_password"`
	GPUCardType          string            `json:"gpu_card_type"`
	ExpectedGPUCount     int               `json:"expected_gpu_count"`
	TargetClusterEndpoint string          `json:"target_cluster_endpoint"`
	KubeadmToken         string            `json:"kubeadm_token"`
	KubeadmCAHash        string            `json:"kubeadm_ca_hash"`
	NodeLabels           map[string]string `json:"node_labels"`
}

type OffboardPayload struct {
	DeviceSN         string `json:"device_sn"`
	NodeName         string `json:"node_name"`
	DrainTimeoutSecs int    `json:"drain_timeout_seconds"`
	Force            bool   `json:"force"`
}

type StageResult struct {
	Stage      string      `json:"stage"`
	Status     string      `json:"status"`
	DurationMs int64       `json:"duration_ms"`
	Output     interface{} `json:"output,omitempty"`
	Error      string      `json:"error,omitempty"`
}

type DeviceCache struct {
	SN          string `json:"sn"`
	InternalIP  string `json:"internal_ip"`
	NodeName    string `json:"node_name"`
	GPUType     string `json:"gpu_type"`
	GPUCount    int    `json:"gpu_count"`
	OSID        string `json:"os_id"`
	OSVersion   string `json:"os_version"`
	LabelsJSON  string `json:"labels_json"`
	LastProbed  string `json:"last_probed_at"`
	UpdatedAt   string `json:"updated_at"`
}

type AuditEntry struct {
	ID        int64  `json:"id"`
	TaskID    string `json:"task_id"`
	Action    string `json:"action"`
	Details   string `json:"details"`
	CreatedAt string `json:"created_at"`
}
