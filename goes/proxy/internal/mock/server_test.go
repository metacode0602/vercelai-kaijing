package mock

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/openroute/goes/proxy/internal/state"
)

func setupMock(t *testing.T) *MockPlatform {
	t.Helper()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	m := NewMockPlatform(":0", logger)
	return m
}

func TestRegister(t *testing.T) {
	m := setupMock(t)
	ts := httptest.NewServer(m.Handler())
	defer ts.Close()

	body := `{"agent_id":"test-001","agent_token":"oat_test","datacenter":"TEST-DC"}`
	resp, err := http.Post(ts.URL+"/api/agent/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("register request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Errorf("register status = %d, expected 200", resp.StatusCode)
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if result["status"] != "registered" {
		t.Errorf("status = %v, expected 'registered'", result["status"])
	}
	if result["access_token"] == nil || result["access_token"] == "" {
		t.Error("access_token is empty")
	}
}

func TestHeartbeat(t *testing.T) {
	m := setupMock(t)
	ts := httptest.NewServer(m.Handler())
	defer ts.Close()

	// Register first
	body := `{"agent_id":"hb-001","agent_token":"oat_test","datacenter":"TEST-DC"}`
	http.Post(ts.URL+"/api/agent/register", "application/json", strings.NewReader(body))

	// Heartbeat
	hbBody := `{"agent_id":"hb-001","k8s_reachable":true,"device_count":5}`
	resp, err := http.Post(ts.URL+"/api/agent/heartbeat", "application/json", strings.NewReader(hbBody))
	if err != nil {
		t.Fatalf("heartbeat request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Errorf("heartbeat status = %d, expected 200", resp.StatusCode)
	}

	m.mu.RLock()
	agent := m.agents["hb-001"]
	m.mu.RUnlock()

	if agent == nil {
		t.Fatal("agent not found after heartbeat")
	}
	if agent.Status != "online" {
		t.Errorf("agent status = %q, expected 'online'", agent.Status)
	}
}

func TestFetchTasks(t *testing.T) {
	m := setupMock(t)
	ts := httptest.NewServer(m.Handler())
	defer ts.Close()

	m.EnqueueTask(state.Task{
		ID:       "fetch-001",
		Type:     state.TaskTypeDeviceOnboard,
		Status:   state.TaskStatusPending,
		Priority: 1,
		CreatedAt: time.Now(),
		Payload:  json.RawMessage(`{"device_sn":"SN001"}`),
	})

	resp, err := http.Get(ts.URL + "/api/agent/tasks/pending")
	if err != nil {
		t.Fatalf("fetch tasks failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	tasks := result["tasks"].([]interface{})
	if len(tasks) != 1 {
		t.Errorf("tasks count = %d, expected 1", len(tasks))
	}
}

func TestReportResult(t *testing.T) {
	m := setupMock(t)
	ts := httptest.NewServer(m.Handler())
	defer ts.Close()

	m.EnqueueTask(state.Task{
		ID:       "report-001",
		Type:     state.TaskTypeDeviceOnboard,
		Status:   state.TaskStatusPending,
		CreatedAt: time.Now(),
		Payload:  json.RawMessage(`{"device_sn":"SN001"}`),
	})

	// Fetch task first
	http.Get(ts.URL + "/api/agent/tasks/pending")

	// Report result
	body := `{"status":"completed","stages":[{"stage":"ssh_verify","status":"success","duration_ms":1234}]}`
	req, _ := http.NewRequest("PATCH", ts.URL+"/api/agent/tasks/report-001", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("report result failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Errorf("report status = %d, expected 200", resp.StatusCode)
	}

	results := m.GetResults("report-001")
	if len(results) != 1 {
		t.Errorf("results count = %d, expected 1", len(results))
	}
	if results[0].Stage != "ssh_verify" {
		t.Errorf("stage = %q, expected 'ssh_verify'", results[0].Stage)
	}
}

func TestVersion(t *testing.T) {
	m := setupMock(t)
	ts := httptest.NewServer(m.Handler())
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/api/agent/version")
	if err != nil {
		t.Fatalf("version request failed: %v", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if result["latest"] != "1.0.0" {
		t.Errorf("latest = %v, expected '1.0.0'", result["latest"])
	}
}
