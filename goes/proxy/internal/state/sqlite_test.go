package state

import (
	"encoding/json"
	"testing"
	"time"
)

func TestStoreMigrate(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()
}

func TestInsertAndGetPendingTasks(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	payload, _ := json.Marshal(OnboardPayload{
		DeviceSN:   "SN001",
		InternalIP: "10.0.0.1",
	})

	task := Task{
		ID:         "task-001",
		Type:       TaskTypeDeviceOnboard,
		Status:     TaskStatusPending,
		Priority:   1,
		Payload:    payload,
		MaxRetries: 3,
		CreatedAt:  time.Now(),
	}

	if err := store.InsertTask(task); err != nil {
		t.Fatalf("InsertTask() error = %v", err)
	}

	tasks, err := store.GetPendingTasks()
	if err != nil {
		t.Fatalf("GetPendingTasks() error = %v", err)
	}

	if len(tasks) != 1 {
		t.Fatalf("GetPendingTasks() returned %d tasks, expected 1", len(tasks))
	}

	if tasks[0].ID != "task-001" {
		t.Errorf("task.ID = %q, expected %q", tasks[0].ID, "task-001")
	}

	if tasks[0].Type != TaskTypeDeviceOnboard {
		t.Errorf("task.Type = %q, expected %q", tasks[0].Type, TaskTypeDeviceOnboard)
	}
}

func TestUpdateTaskStatus(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	payload, _ := json.Marshal(OnboardPayload{DeviceSN: "SN001"})
	task := Task{
		ID:         "task-002",
		Type:       TaskTypeDeviceOnboard,
		Status:     TaskStatusPending,
		Payload:    payload,
		MaxRetries: 3,
		CreatedAt:  time.Now(),
	}
	store.InsertTask(task)

	if err := store.UpdateTaskStatus("task-002", TaskStatusRunning, "", ""); err != nil {
		t.Fatalf("UpdateTaskStatus() error = %v", err)
	}

	tasks, _ := store.GetPendingTasks()
	if len(tasks) != 1 {
		t.Fatalf("expected 1 running task, got %d", len(tasks))
	}

	stagesJSON := `[{"stage":"ssh_verify","status":"success"}]`
	if err := store.UpdateTaskStatus("task-002", TaskStatusCompleted, stagesJSON, ""); err != nil {
		t.Fatalf("UpdateTaskStatus() completed error = %v", err)
	}

	tasks, _ = store.GetPendingTasks()
	if len(tasks) != 0 {
		t.Fatalf("expected 0 pending tasks after completion, got %d", len(tasks))
	}
}

func TestDeviceCache(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	d := DeviceCache{
		SN:        "SN001",
		InternalIP: "10.0.0.1",
		GPUType:   "NVIDIA A100 80GB",
		GPUCount:  8,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}

	if err := store.SaveDeviceCache(d); err != nil {
		t.Fatalf("SaveDeviceCache() error = %v", err)
	}

	cached, err := store.GetDeviceCache("SN001")
	if err != nil {
		t.Fatalf("GetDeviceCache() error = %v", err)
	}

	if cached.SN != "SN001" {
		t.Errorf("cached.SN = %q, expected %q", cached.SN, "SN001")
	}
	if cached.GPUCount != 8 {
		t.Errorf("cached.GPUCount = %d, expected 8", cached.GPUCount)
	}

	// Non-existent device
	_, err = store.GetDeviceCache("SN999")
	if err == nil {
		t.Error("GetDeviceCache() expected error for non-existent device")
	}
}

func TestAuditLog(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	if err := store.WriteAuditLog("task-001", "ssh_verify", "success"); err != nil {
		t.Fatalf("WriteAuditLog() error = %v", err)
	}
}

func TestDeviceCount(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	if count := store.DeviceCount(); count != 0 {
		t.Errorf("DeviceCount() = %d, expected 0", count)
	}

	store.SaveDeviceCache(DeviceCache{SN: "SN001", InternalIP: "10.0.0.1"})
	store.SaveDeviceCache(DeviceCache{SN: "SN002", InternalIP: "10.0.0.2"})

	if count := store.DeviceCount(); count != 2 {
		t.Errorf("DeviceCount() = %d, expected 2", count)
	}
}

func TestIncrementRetry(t *testing.T) {
	dir := t.TempDir()
	store, err := New(dir)
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	defer store.Close()

	payload, _ := json.Marshal(OnboardPayload{DeviceSN: "SN001"})
	task := Task{
		ID:         "task-retry",
		Type:       TaskTypeDeviceOnboard,
		Status:     TaskStatusPending,
		Payload:    payload,
		RetryCount: 0,
		MaxRetries: 3,
		CreatedAt:  time.Now(),
	}
	store.InsertTask(task)

	store.IncrementRetry("task-retry")

	tasks, _ := store.GetPendingTasks()
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].RetryCount != 1 {
		t.Errorf("RetryCount = %d, expected 1", tasks[0].RetryCount)
	}
}
