package mock

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/openroute/goes/proxy/internal/state"
)

type MockPlatform struct {
	server   *http.Server
	logger   *slog.Logger
	mu       sync.RWMutex
	agents   map[string]*AgentRecord
	tasks    map[string]*state.Task
	results  map[string][]state.StageResult
	token    string
	jwtToken string
}

type AgentRecord struct {
	ID        string    `json:"id"`
	Token     string    `json:"token"`
	Datacenter string   `json:"datacenter"`
	Status    string    `json:"status"`
	LastHB    time.Time `json:"last_heartbeat"`
}

func NewMockPlatform(addr string, logger *slog.Logger) *MockPlatform {
	m := &MockPlatform{
		logger:  logger,
		agents:  make(map[string]*AgentRecord),
		tasks:   make(map[string]*state.Task),
		results: make(map[string][]state.StageResult),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/agent/register", m.handleRegister)
	mux.HandleFunc("POST /api/agent/heartbeat", m.handleHeartbeat)
	mux.HandleFunc("GET /api/agent/tasks/pending", m.handleFetchTasks)
	mux.HandleFunc("PATCH /api/agent/tasks/{taskId}", m.handleReportResult)
	mux.HandleFunc("GET /api/agent/version", m.handleVersion)
	mux.HandleFunc("GET /health", m.handleHealth)

	m.server = &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	return m
}

func (m *MockPlatform) Handler() http.Handler {
	return m.server.Handler
}

func (m *MockPlatform) Run() error {
	m.logger.Info("mock platform starting", "addr", m.server.Addr)
	return m.server.ListenAndServe()
}

func (m *MockPlatform) Stop() error {
	return m.server.Close()
}

func (m *MockPlatform) EnqueueTask(task state.Task) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tasks[task.ID] = &task
	m.logger.Info("task enqueued", "task_id", task.ID, "type", task.Type)
}

func (m *MockPlatform) GetResults(taskID string) []state.StageResult {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.results[taskID]
}

func (m *MockPlatform) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID    string `json:"agent_id"`
		AgentToken string `json:"agent_token"`
		Datacenter string `json:"datacenter"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	m.agents[req.AgentID] = &AgentRecord{
		ID:         req.AgentID,
		Token:      req.AgentToken,
		Datacenter: req.Datacenter,
		Status:     "registered",
		LastHB:     time.Now(),
	}

	jwtID := req.AgentID
	if len(jwtID) > 8 {
		jwtID = jwtID[:8]
	}
	m.jwtToken = fmt.Sprintf("mock-jwt-%s", jwtID)

	m.logger.Info("agent registered", "agent_id", req.AgentID, "datacenter", req.Datacenter)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":             "registered",
		"access_token":       m.jwtToken,
		"heartbeat_interval": 30,
	})
}

func (m *MockPlatform) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID      string `json:"agent_id"`
		K8sReachable bool   `json:"k8s_reachable"`
		DeviceCount  int    `json:"device_count"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	if agent, ok := m.agents[req.AgentID]; ok {
		agent.LastHB = time.Now()
		agent.Status = "online"
	}

	m.logger.Info("heartbeat received",
		"agent_id", req.AgentID,
		"k8s_reachable", req.K8sReachable,
		"device_count", req.DeviceCount,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (m *MockPlatform) handleFetchTasks(w http.ResponseWriter, r *http.Request) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var pendingTasks []state.Task
	for _, t := range m.tasks {
		if t.Status == state.TaskStatusPending {
			pendingTasks = append(pendingTasks, *t)
			t.Status = state.TaskStatusRunning
		}
	}

	m.logger.Info("tasks fetched", "count", len(pendingTasks))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tasks": pendingTasks,
	})
}

func (m *MockPlatform) handleReportResult(w http.ResponseWriter, r *http.Request) {
	taskID := r.PathValue("taskId")

	var req struct {
		Status string             `json:"status"`
		Stages []state.StageResult `json:"stages"`
		Error  string             `json:"error,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.tasks[taskID].Status = state.TaskStatus(req.Status)
	m.results[taskID] = req.Stages

	m.logger.Info("task result received",
		"task_id", taskID,
		"status", req.Status,
		"stages", len(req.Stages),
		"error", req.Error,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (m *MockPlatform) handleVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"latest": "1.0.0",
		"versions": []string{"1.0.0"},
	})
}

func (m *MockPlatform) handleHealth(w http.ResponseWriter, r *http.Request) {
	m.mu.RLock()
	agentCount := len(m.agents)
	taskCount := len(m.tasks)
	m.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"agents":     agentCount,
		"tasks":      taskCount,
		"mock":       true,
	})
}
