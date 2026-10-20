import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { requireMerchantApiKey, requireMerchantAuth } from "../lib/api-key-auth"
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  getTaskStatus,
} from "../lib/task-service"

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const TaskSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["job", "serverless", "vm", "spot"]),
    status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
    merchantId: z.string(),
    tenantId: z.string(),
    gpuCardType: z.string().nullable().optional(),
    gpuCount: z.number().int().nullable().optional(),
    imageId: z.string().nullable().optional(),
    command: z.string().nullable().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("Task")

const CreateTaskBodySchema = z
  .object({
    name: z.string().openapi({ example: "training-job-1" }),
    type: z.enum(["job", "serverless", "vm", "spot"]),
    // merchantId 不再是入参：P0-6 之前它由客户端传入，商户 A 改个参数即可
    // 写入商户 B 名下。服务端一律从 API-Key 凭证派生。
    tenantId: z.string(),
    gpuCardType: z.string().optional(),
    gpuCount: z.number().int().positive().optional().openapi({ example: 2 }),
    imageId: z.string().optional(),
    command: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("CreateTaskBody")

const CreateTaskResponseSchema = z
  .object({
    task: TaskSchema,
  })
  .openapi("CreateTaskResponse")

const ListTasksQuerySchema = z
  .object({
    // merchantId 由凭证派生，不接受查询参数（P0-6）
    tenantId: z.string().optional(),
    status: z.enum(["pending", "running", "completed", "failed", "cancelled"]).optional(),
    limit: z.coerce.number().int().positive().max(100).optional().default(20),
    offset: z.coerce.number().int().nonnegative().optional().default(0),
  })
  .openapi("ListTasksQuery")

const ListTasksResponseSchema = z
  .object({
    tasks: z.array(TaskSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .openapi("ListTasksResponse")

const UpdateTaskBodySchema = z
  .object({
    status: z.enum(["cancelled"]).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("UpdateTaskBody")

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error")

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const tasks = new OpenAPIHono()

// 全部任务端点都代表「写/读本商户资源」，统一要求 consumption:write scope。
// merchantId 从此只有凭证一个来源。
tasks.use("/*", requireMerchantApiKey("consumption:write"))

// POST /tasks - Create a new task
tasks.openapi(
  createRoute({
    method: "post",
    path: "/",
    summary: "Create a new compute task",
    description: "创建新的算力任务（供 OEM 品牌站调用）",
    tags: ["Tasks"],
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateTaskBodySchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Task created successfully",
        content: {
          "application/json": {
            schema: CreateTaskResponseSchema,
          },
        },
      },
      400: {
        description: "Bad request",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json")
    const { merchantId } = requireMerchantAuth(c)

    try {
      const task = await createTask({ ...body, merchantId })
      return c.json({ task }, 201)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create task"
      return c.json({ error: message }, 400)
    }
  }
)

// GET /tasks - List tasks
tasks.openapi(
  createRoute({
    method: "get",
    path: "/",
    summary: "List compute tasks",
    description: "查询算力任务列表（支持商户/租户过滤）",
    tags: ["Tasks"],
    request: {
      query: ListTasksQuerySchema,
    },
    responses: {
      200: {
        description: "Tasks retrieved successfully",
        content: {
          "application/json": {
            schema: ListTasksResponseSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query")

    const { merchantId } = requireMerchantAuth(c)

    const result = await listTasks({
      // 强制按凭证商户过滤：即便调用方伪造 query 也拿不到别人的数据
      merchantId,
      tenantId: query.tenantId,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    })

    return c.json(
      {
        tasks: result.tasks,
        total: result.total,
        limit: query.limit ?? 20,
        offset: query.offset ?? 0,
      },
      200,
    )
  }
)

// GET /tasks/:id - Get task details
tasks.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    summary: "Get task details",
    description: "获取指定任务的详细信息",
    tags: ["Tasks"],
    request: {
      params: z.object({
        id: z.string().openapi({ example: "task_123" }),
      }),
    },
    responses: {
      200: {
        description: "Task retrieved successfully",
        content: {
          "application/json": {
            schema: TaskSchema,
          },
        },
      },
      404: {
        description: "Task not found",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const params = c.req.valid("param")
    const { merchantId } = requireMerchantAuth(c)

    const task = await getTask(params.id, merchantId)

    if (!task) {
      return c.json({ error: "Task not found" }, 404)
    }

    return c.json(task, 200)
  }
)

// PATCH /tasks/:id - Update task
tasks.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    summary: "Update task",
    description: "更新任务状态或配置（如取消任务）",
    tags: ["Tasks"],
    request: {
      params: z.object({
        id: z.string().openapi({ example: "task_123" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpdateTaskBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Task updated successfully",
        content: {
          "application/json": {
            schema: TaskSchema,
          },
        },
      },
      404: {
        description: "Task not found",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const params = c.req.valid("param")
    const updateData = c.req.valid("json")

    // merchantId 由 API-Key 凭证派生（P0-6：不再信任 query/body 传参）
    const { merchantId } = requireMerchantAuth(c)

    const task = await updateTask(params.id, merchantId, updateData)

    if (!task) {
      return c.json({ error: "Task not found" }, 404)
    }

    return c.json(task, 200)
  }
)

// GET /tasks/:id/status - Get task status (lightweight endpoint)
tasks.openapi(
  createRoute({
    method: "get",
    path: "/{id}/status",
    summary: "Get task status",
    description: "获取任务当前状态（轻量级监控接口）",
    tags: ["Tasks"],
    request: {
      params: z.object({
        id: z.string().openapi({ example: "task_123" }),
      }),
    },
    responses: {
      200: {
        description: "Task status retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              id: z.string(),
              status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
              progress: z.number().min(0).max(100).optional(),
              message: z.string().nullable().optional(),
            }),
          },
        },
      },
      404: {
        description: "Task not found",
        content: {
          "application/json": {
            schema: ErrorSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const params = c.req.valid("param")
    const { merchantId } = requireMerchantAuth(c)

    const status = await getTaskStatus(params.id, merchantId)

    if (!status) {
      return c.json({ error: "Task not found" }, 404)
    }

    return c.json(status, 200)
  }
)

export default tasks
