package k8s

import (
	"context"
	"fmt"
	"os"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

type Client struct {
	clientset kubernetes.Interface
	reachable bool
}

func New(kubeconfigPath string) (*Client, error) {
	if kubeconfigPath == "" {
		home, _ := os.UserHomeDir()
		kubeconfigPath = home + "/.kube/config"
	}

	config, err := clientcmd.BuildConfigFromFlags("", kubeconfigPath)
	if err != nil {
		return &Client{reachable: false}, fmt.Errorf("build kubeconfig: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return &Client{reachable: false}, fmt.Errorf("create clientset: %w", err)
	}

	return &Client{clientset: clientset, reachable: true}, nil
}

func (c *Client) IsReachable() bool {
	return c.reachable
}

func (c *Client) GetNode(ctx context.Context, name string) (*corev1.Node, error) {
	return c.clientset.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
}

func (c *Client) LabelNode(ctx context.Context, name, key, value string) error {
	_, err := c.clientset.CoreV1().Nodes().Patch(ctx, name,
		"merge",
		[]byte(fmt.Sprintf(`{"metadata":{"labels":{"%s":"%s"}}}`, key, value)),
		metav1.PatchOptions{},
	)
	return err
}

func (c *Client) TaintNode(ctx context.Context, name, key, value string, effect corev1.TaintEffect) error {
	taintPatch := fmt.Sprintf(`{"spec":{"taints":[{"key":"%s","value":"%s","effect":"%s"}]}}`, key, value, effect)
	_, err := c.clientset.CoreV1().Nodes().Patch(ctx, name,
		"merge",
		[]byte(taintPatch),
		metav1.PatchOptions{},
	)
	return err
}

func (c *Client) CordonNode(ctx context.Context, name string) error {
	patch := []byte(`{"spec":{"unschedulable":true}}`)
	_, err := c.clientset.CoreV1().Nodes().Patch(ctx, name, "merge", patch, metav1.PatchOptions{})
	return err
}

func (c *Client) DrainNode(ctx context.Context, name string, timeout time.Duration, force bool) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	node, err := c.GetNode(ctx, name)
	if err != nil {
		return fmt.Errorf("get node: %w", err)
	}

	if node.Spec.Unschedulable && !force {
		return nil // already cordoned
	}

	if err := c.CordonNode(ctx, name); err != nil {
		return fmt.Errorf("cordon: %w", err)
	}

	pods, err := c.clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("spec.nodeName=%s", name),
	})
	if err != nil {
		return fmt.Errorf("list pods: %w", err)
	}

	for _, pod := range pods.Items {
		if pod.Namespace == "kube-system" && !force {
			continue
		}
		_ = c.clientset.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{
			GracePeriodSeconds: int64Ptr(30),
		})
	}

	return nil
}

func (c *Client) DeleteNode(ctx context.Context, name string) error {
	return c.clientset.CoreV1().Nodes().Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) WaitNodeReady(ctx context.Context, nodeName string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("node %s not ready within %v", nodeName, timeout)
		case <-ticker.C:
			node, err := c.GetNode(ctx, nodeName)
			if err != nil {
				continue
			}
			for _, cond := range node.Status.Conditions {
				if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
					return nil
				}
			}
		}
	}
}

func int64Ptr(i int64) *int64 {
	return &i
}
