package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/openroute/goes/proxy/internal/mock"
	"github.com/openroute/goes/proxy/internal/state"
)

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	mockServer := mock.NewMockPlatform(*addr, logger)

	// Pre-load some demo tasks
	mockServer.EnqueueTask(state.Task{
		ID:         "demo-onboard-001",
		Type:       state.TaskTypeDeviceOnboard,
		Status:     state.TaskStatusPending,
		Priority:   1,
		MaxRetries: 3,
		CreatedAt:  time.Now(),
		Payload: mustMarshal(state.OnboardPayload{
			DeviceSN:              "SN2026A10001",
			InternalIP:            "10.0.1.101",
			SSHUsername:           "root",
			GPUCardType:           "NVIDIA A100 80GB",
			ExpectedGPUCount:      8,
			TargetClusterEndpoint: "10.0.1.1:6443",
			KubeadmToken:          "abcdef.0123456789abcdef",
			KubeadmCAHash:         "abcd1234",
			NodeLabels: map[string]string{
				"openroute.io/supplier":   "hb-gpu-01",
				"openroute.io/datacenter": "sh-zj-01",
			},
		}),
	})

	mockServer.EnqueueTask(state.Task{
		ID:         "demo-offboard-001",
		Type:       state.TaskTypeDeviceOffboard,
		Status:     state.TaskStatusPending,
		Priority:   0,
		MaxRetries: 3,
		CreatedAt:  time.Now(),
		Payload: mustMarshal(state.OffboardPayload{
			DeviceSN:         "SN2026A00042",
			NodeName:         "sn2026a00042",
			DrainTimeoutSecs: 1800,
			Force:            true,
		}),
	})

	fmt.Printf("Mock platform running on %s\n", *addr)
	fmt.Println("Endpoints:")
	fmt.Println("  POST /api/agent/register       - Agent registration")
	fmt.Println("  POST /api/agent/heartbeat      - Agent heartbeat")
	fmt.Println("  GET  /api/agent/tasks/pending  - Fetch pending tasks")
	fmt.Println("  PATCH /api/agent/tasks/{id}    - Report task result")
	fmt.Println("  GET  /api/agent/version        - Version info")
	fmt.Println("  GET  /health                   - Platform health")

	if err := mockServer.Run(); err != nil {
		logger.Error("mock server failed", "error", err)
		os.Exit(1)
	}
}

func mustMarshal(v interface{}) json.RawMessage {
	data, _ := json.Marshal(v)
	return data
}
