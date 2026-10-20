package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/engine"
	"github.com/openroute/goes/proxy/internal/health"
	k8sutil "github.com/openroute/goes/proxy/internal/k8s"
	"github.com/openroute/goes/proxy/internal/platform"
	"github.com/openroute/goes/proxy/internal/server"
	"github.com/openroute/goes/proxy/internal/ssh"
	"github.com/openroute/goes/proxy/internal/state"
	"github.com/openroute/goes/proxy/internal/update"
)

var version = "dev"

func main() {
	configPath := flag.String("config", "/etc/openroute/agent.yaml", "path to agent config")
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()

	if *showVersion {
		fmt.Printf("openroute-agent %s\n", version)
		os.Exit(0)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	logger.Info("starting openroute-agent", "version", version, "config", *configPath)

	cfg, err := config.Load(*configPath)
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	store, err := state.New(cfg.StateDir)
	if err != nil {
		logger.Error("failed to init state store", "error", err)
		os.Exit(1)
	}
	defer store.Close()

	platformClient := platform.New(cfg)

	sshClient := ssh.New(cfg.SSH)
	if cfg.SSH.Bastion.Host != "" {
		if err := sshClient.ConnectBastion(); err != nil {
			logger.Warn("bastion connection failed", "error", err)
		}
	}

	var k8sClient *k8sutil.Client
	if cfg.K8s.KubeconfigPath != "" {
		k8sClient, err = k8sutil.New(cfg.K8s.KubeconfigPath)
		if err != nil {
			logger.Warn("k8s client init failed", "error", err)
		}
	}

	eng := engine.New(cfg, store, platformClient, sshClient, k8sClient, logger)

	// Health monitor
	healthMonitor := health.NewMonitor(cfg, store, func(ctx context.Context, ip, user, password string) error {
		client, err := sshClient.Dial(ip, user, password)
		if err != nil {
			return err
		}
		defer client.Close()
		return nil
	}, logger)

	// Self-updater
	updater := update.New(version, cfg.APIURL, "/usr/local/bin", logger)

	// Check for updates on startup (non-blocking)
	go func() {
		if err := updater.CheckAndApply(context.Background()); err != nil {
			logger.Warn("self-update check failed", "error", err)
		}
	}()

	// Register with platform
	regResp, err := platformClient.Register()
	if err != nil {
		logger.Error("failed to register with platform", "error", err)
	} else {
		logger.Info("registered with platform", "heartbeat_interval", regResp.HeartbeatInterval)
	}

	// Recover pending tasks from SQLite
	pendingTasks, err := store.GetPendingTasks()
	if err != nil {
		logger.Error("failed to recover pending tasks", "error", err)
	} else {
		for _, t := range pendingTasks {
			eng.Enqueue(t)
		}
		logger.Info("recovered pending tasks", "count", len(pendingTasks))
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Start task poller
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.Polling.TaskInterval) * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				tasks, err := platformClient.FetchPendingTasks()
				if err != nil {
					logger.Error("failed to fetch tasks", "error", err)
					continue
				}
				for _, t := range tasks {
					t.Status = state.TaskStatusPending
					if err := store.InsertTask(t); err != nil {
						logger.Error("failed to store task", "task_id", t.ID, "error", err)
						continue
					}
					eng.Enqueue(t)
				}
			}
		}
	}()

	// Start heartbeat
	go func() {
		ticker := time.NewTicker(time.Duration(cfg.Polling.HeartbeatInterval) * time.Second)
		defer ticker.Stop()
		k8sReachable := k8sClient != nil && k8sClient.IsReachable()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := platformClient.Heartbeat(k8sReachable, store.DeviceCount()); err != nil {
					logger.Error("heartbeat failed", "error", err)
				}
			}
		}
	}()

	// Start engine
	go eng.Start(ctx)

	// Start health monitor
	go healthMonitor.Start(ctx)

	// Start HTTP server
	httpServer := server.New(cfg, store, eng, logger)
	go func() {
		if err := httpServer.Run(ctx); err != nil {
			logger.Error("http server error", "error", err)
		}
	}()

	// Wait for shutdown signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	logger.Info("shutting down")
	cancel()
	time.Sleep(2 * time.Second)
}
