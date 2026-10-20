package health

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/state"
)

type Prober interface {
	Probe(ctx context.Context, ip, user, password string) error
}

type SSHProber struct {
	sshProber func(ctx context.Context, ip, user, password string) error
}

type Monitor struct {
	cfg       *config.Config
	store     *state.Store
	prober    *SSHProber
	logger    *slog.Logger
	failCount atomic.Int32
	status    atomic.Value // "ok" or "degraded"
	mu        sync.RWMutex
	devices   map[string]*DeviceHealth
}

type DeviceHealth struct {
	SN             string    `json:"sn"`
	InternalIP     string    `json:"internal_ip"`
	SSHReachable   bool      `json:"ssh_reachable"`
	LastCheckedAt  time.Time `json:"last_checked_at"`
	ConsecutiveFails int     `json:"consecutive_fails"`
}

type SSHProbeFunc func(ctx context.Context, ip, user, password string) error

func NewMonitor(cfg *config.Config, store *state.Store, probeFn SSHProbeFunc, logger *slog.Logger) *Monitor {
	m := &Monitor{
		cfg:    cfg,
		store:  store,
		logger: logger,
		devices: make(map[string]*DeviceHealth),
	}
	m.status.Store("ok")
	m.prober = &SSHProber{sshProber: probeFn}
	return m
}

func (m *Monitor) Start(ctx context.Context) {
	if m.cfg.Health.SSHProbeInterval <= 0 {
		m.logger.Info("SSH health probe disabled")
		return
	}

	interval := time.Duration(m.cfg.Health.SSHProbeInterval) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	m.logger.Info("SSH health monitor started", "interval", interval)

	for {
		select {
		case <-ctx.Done():
			m.logger.Info("SSH health monitor stopped")
			return
		case <-ticker.C:
			m.probeAll(ctx)
		}
	}
}

func (m *Monitor) probeAll(ctx context.Context) {
	m.mu.RLock()
	devices := make([]*DeviceHealth, 0, len(m.devices))
	for _, d := range m.devices {
		devices = append(devices, d)
	}
	m.mu.RUnlock()

	for _, d := range devices {
		m.probeDevice(ctx, d)
	}
}

func (m *Monitor) probeDevice(ctx context.Context, d *DeviceHealth) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	err := m.prober.sshProber(ctx, d.InternalIP, "root", "")
	d.LastCheckedAt = time.Now()

	if err != nil {
		d.ConsecutiveFails++
		d.SSHReachable = false
		m.logger.Warn("SSH probe failed",
			"sn", d.SN,
			"ip", d.InternalIP,
			"consecutive_fails", d.ConsecutiveFails,
			"error", err,
		)

		if d.ConsecutiveFails >= m.cfg.Health.SSHConsecutiveFailMax {
			m.failCount.Add(1)
			m.status.Store("degraded")
			m.logger.Error("SSH health degraded",
				"sn", d.SN,
				"consecutive_fails", d.ConsecutiveFails,
				"threshold", m.cfg.Health.SSHConsecutiveFailMax,
			)
		}
	} else {
		wasFailing := d.ConsecutiveFails >= m.cfg.Health.SSHConsecutiveFailMax
		d.ConsecutiveFails = 0
		d.SSHReachable = true

		if wasFailing {
			m.logger.Info("SSH health recovered", "sn", d.SN)
			if m.failCount.Load() > 0 {
				m.failCount.Add(-1)
			}
			if m.failCount.Load() == 0 {
				m.status.Store("ok")
			}
		}
	}
}

func (m *Monitor) RegisterDevice(sn, internalIP string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.devices[sn] = &DeviceHealth{
		SN:         sn,
		InternalIP: internalIP,
	}
}

func (m *Monitor) RemoveDevice(sn string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.devices, sn)
}

func (m *Monitor) Status() string {
	return m.status.Load().(string)
}

func (m *Monitor) DeviceHealthMap() map[string]*DeviceHealth {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make(map[string]*DeviceHealth, len(m.devices))
	for k, v := range m.devices {
		cp := *v
		result[k] = &cp
	}
	return result
}
