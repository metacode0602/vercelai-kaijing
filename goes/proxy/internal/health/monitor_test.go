package health

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/state"
)

func TestMonitorRegisterDevice(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0 // disable periodic probe
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	probeFn := func(ctx context.Context, ip, user, password string) error {
		return nil
	}

	monitor := NewMonitor(cfg, store, probeFn, logger)
	monitor.RegisterDevice("SN001", "10.0.0.1")

	devices := monitor.DeviceHealthMap()
	if len(devices) != 1 {
		t.Errorf("DeviceHealthMap() returned %d devices, expected 1", len(devices))
	}

	d, ok := devices["SN001"]
	if !ok {
		t.Fatal("device SN001 not found")
	}
	if d.InternalIP != "10.0.0.1" {
		t.Errorf("InternalIP = %q, expected %q", d.InternalIP, "10.0.0.1")
	}
}

func TestMonitorRemoveDevice(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	probeFn := func(ctx context.Context, ip, user, password string) error { return nil }
	monitor := NewMonitor(cfg, store, probeFn, logger)

	monitor.RegisterDevice("SN001", "10.0.0.1")
	monitor.RemoveDevice("SN001")

	devices := monitor.DeviceHealthMap()
	if len(devices) != 0 {
		t.Errorf("DeviceHealthMap() returned %d devices, expected 0", len(devices))
	}
}

func TestMonitorProbeSuccess(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0
	cfg.Health.SSHConsecutiveFailMax = 3
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	probeFn := func(ctx context.Context, ip, user, password string) error {
		return nil
	}
	monitor := NewMonitor(cfg, store, probeFn, logger)
	monitor.RegisterDevice("SN001", "10.0.0.1")

	// Probe via internal method
	dev := &DeviceHealth{SN: "SN001", InternalIP: "10.0.0.1"}
	monitor.probeDevice(context.Background(), dev)

	if !dev.SSHReachable {
		t.Error("SSHReachable should be true after successful probe")
	}
	if dev.ConsecutiveFails != 0 {
		t.Errorf("ConsecutiveFails = %d, expected 0", dev.ConsecutiveFails)
	}
	if monitor.Status() != "ok" {
		t.Errorf("Status = %q, expected %q", monitor.Status(), "ok")
	}
}

func TestMonitorProbeFailure(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0
	cfg.Health.SSHConsecutiveFailMax = 3
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	probeFn := func(ctx context.Context, ip, user, password string) error {
		return &probeError{"connection refused"}
	}
	monitor := NewMonitor(cfg, store, probeFn, logger)
	monitor.RegisterDevice("SN001", "10.0.0.1")

	dev := &DeviceHealth{SN: "SN001", InternalIP: "10.0.0.1"}

	// Probe 2 times - should still be ok
	monitor.probeDevice(context.Background(), dev)
	monitor.probeDevice(context.Background(), dev)

	if dev.ConsecutiveFails != 2 {
		t.Errorf("ConsecutiveFails = %d, expected 2", dev.ConsecutiveFails)
	}
	if monitor.Status() != "ok" {
		t.Errorf("Status = %q, expected 'ok' before threshold", monitor.Status())
	}

	// 3rd failure - should degrade
	monitor.probeDevice(context.Background(), dev)

	if dev.ConsecutiveFails != 3 {
		t.Errorf("ConsecutiveFails = %d, expected 3", dev.ConsecutiveFails)
	}
	if monitor.Status() != "degraded" {
		t.Errorf("Status = %q, expected 'degraded'", monitor.Status())
	}
}

func TestMonitorRecovery(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0
	cfg.Health.SSHConsecutiveFailMax = 3
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	fail := true
	probeFn := func(ctx context.Context, ip, user, password string) error {
		if fail {
			return &probeError{"unreachable"}
		}
		return nil
	}
	monitor := NewMonitor(cfg, store, probeFn, logger)
	monitor.RegisterDevice("SN001", "10.0.0.1")

	dev := &DeviceHealth{SN: "SN001", InternalIP: "10.0.0.1"}

	// Fail 3 times
	for i := 0; i < 3; i++ {
		monitor.probeDevice(context.Background(), dev)
	}
	if monitor.Status() != "degraded" {
		t.Fatalf("Status = %q, expected 'degraded'", monitor.Status())
	}

	// Recover
	fail = false
	monitor.probeDevice(context.Background(), dev)

	if dev.ConsecutiveFails != 0 {
		t.Errorf("ConsecutiveFails = %d, expected 0 after recovery", dev.ConsecutiveFails)
	}
	if !dev.SSHReachable {
		t.Error("SSHReachable should be true after recovery")
	}
	if monitor.Status() != "ok" {
		t.Errorf("Status = %q, expected 'ok' after recovery", monitor.Status())
	}
}

func TestMonitorStartStop(t *testing.T) {
	dir := t.TempDir()
	store, _ := state.New(dir)
	defer store.Close()

	cfg := config.DefaultConfig()
	cfg.Health.SSHProbeInterval = 0 // disabled
	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	probeFn := func(ctx context.Context, ip, user, password string) error { return nil }
	monitor := NewMonitor(cfg, store, probeFn, logger)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	go func() {
		monitor.Start(ctx)
		close(done)
	}()

	cancel()
	select {
	case <-done:
		// OK
	case <-time.After(2 * time.Second):
		t.Error("monitor.Start() did not return after cancel")
	}
}

type probeError struct {
	msg string
}

func (e *probeError) Error() string {
	return e.msg
}
