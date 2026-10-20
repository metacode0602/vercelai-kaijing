package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/openroute/goes/proxy/internal/config"
	"github.com/openroute/goes/proxy/internal/state"
)

type Server struct {
	cfg    *config.Config
	store  *state.Store
	engine EngineInterface
	logger *slog.Logger
	start  time.Time
}

type EngineInterface interface {
	Enqueue(task state.Task)
}

type HealthResponse struct {
	Status      string `json:"status"`
	Version     string `json:"version"`
	Uptime      string `json:"uptime"`
	TaskQueue   int    `json:"task_queue"`
	K8sReachable bool  `json:"k8s_reachable"`
	Devices     int    `json:"devices"`
}

func New(cfg *config.Config, store *state.Store, engine EngineInterface, logger *slog.Logger) *Server {
	return &Server{
		cfg:    cfg,
		store:  store,
		engine: engine,
		logger: logger,
		start:  time.Now(),
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(s.requestLogger)

	r.Get("/health", s.healthHandler)
	r.Post("/api/callback/task-update", s.taskUpdateCallback)

	return r
}

func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	health := HealthResponse{
		Status:    "ok",
		Version:   "1.0.0",
		Uptime:    time.Since(s.start).String(),
		Devices:   s.store.DeviceCount(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}

func (s *Server) taskUpdateCallback(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TaskID string `json:"task_id"`
		Status string `json:"status"`
		Output string `json:"output"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	s.logger.Info("callback received",
		"task_id", req.TaskID,
		"status", req.Status,
	)

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status":"ok"}`)
}

func (s *Server) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		s.logger.Debug("http_request",
			"method", r.Method,
			"path", r.URL.Path,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

func (s *Server) Run(ctx context.Context) error {
	addr := s.cfg.ListenAddr
	if addr == "" {
		addr = ":9090"
	}

	srv := &http.Server{
		Addr:         addr,
		Handler:      s.Handler(),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		s.logger.Info("http server listening", "addr", addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	case <-ctx.Done():
		s.logger.Info("http server shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
