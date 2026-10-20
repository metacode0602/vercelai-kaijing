package platform

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/state"
)

type Client struct {
	cfg        *config.Config
	httpClient *http.Client
	token      string // JWT access token after registration
}

func New(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: false},
			},
		},
	}
}

type RegisterRequest struct {
	AgentID    string `json:"agent_id"`
	AgentToken string `json:"agent_token"`
	Datacenter string `json:"datacenter"`
}

type RegisterResponse struct {
	Status            string `json:"status"`
	AccessToken       string `json:"access_token"`
	HeartbeatInterval int    `json:"heartbeat_interval"`
}

type HeartbeatRequest struct {
	AgentID     string `json:"agent_id"`
	K8sReachable bool  `json:"k8s_reachable"`
	DeviceCount int   `json:"device_count"`
}

type HeartbeatResponse struct {
	Status string `json:"status"`
}

type TasksResponse struct {
	Tasks []state.Task `json:"tasks"`
}

type TaskUpdateRequest struct {
	Status string             `json:"status"`
	Stages []state.StageResult `json:"stages"`
	Error  string             `json:"error,omitempty"`
}

func (c *Client) Register() (*RegisterResponse, error) {
	req := RegisterRequest{
		AgentID:    c.cfg.AgentID,
		AgentToken: c.cfg.AgentToken,
		Datacenter: c.cfg.Datacenter,
	}

	resp, err := c.post("/api/agent/register", req)
	if err != nil {
		return nil, fmt.Errorf("register: %w", err)
	}

	var regResp RegisterResponse
	if err := json.Unmarshal(resp, &regResp); err != nil {
		return nil, fmt.Errorf("register decode: %w", err)
	}

	c.token = regResp.AccessToken
	return &regResp, nil
}

func (c *Client) Heartbeat(k8sReachable bool, deviceCount int) (*HeartbeatResponse, error) {
	req := HeartbeatRequest{
		AgentID:      c.cfg.AgentID,
		K8sReachable: k8sReachable,
		DeviceCount:  deviceCount,
	}

	resp, err := c.post("/api/agent/heartbeat", req)
	if err != nil {
		return nil, fmt.Errorf("heartbeat: %w", err)
	}

	var hbResp HeartbeatResponse
	if err := json.Unmarshal(resp, &hbResp); err != nil {
		return nil, fmt.Errorf("heartbeat decode: %w", err)
	}
	return &hbResp, nil
}

func (c *Client) FetchPendingTasks() ([]state.Task, error) {
	resp, err := c.get("/api/agent/tasks/pending")
	if err != nil {
		return nil, fmt.Errorf("fetch tasks: %w", err)
	}

	var tasksResp TasksResponse
	if err := json.Unmarshal(resp, &tasksResp); err != nil {
		return nil, fmt.Errorf("fetch tasks decode: %w", err)
	}
	return tasksResp.Tasks, nil
}

func (c *Client) ReportTaskResult(taskID string, req TaskUpdateRequest) error {
	_, err := c.patch(fmt.Sprintf("/api/agent/tasks/%s", taskID), req)
	if err != nil {
		return fmt.Errorf("report task: %w", err)
	}
	return nil
}

func (c *Client) post(path string, body interface{}) ([]byte, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", c.cfg.APIURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}
	return bodyBytes, nil
}

func (c *Client) get(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", c.cfg.APIURL+path, nil)
	if err != nil {
		return nil, err
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}
	return bodyBytes, nil
}

func (c *Client) patch(path string, body interface{}) ([]byte, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("PATCH", c.cfg.APIURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(bodyBytes))
	}
	return bodyBytes, nil
}
