import { db } from '@/lib/db'
import { projectTag, projectTagAssignment } from '@workspace/db/schema'
import { eq } from 'drizzle-orm'

export type CustomerSegmentKey = 'new' | 'old'

const OLD_CUSTOMER_TAGS = new Set(['平台老客', '中台直客'])
const NEW_CUSTOMER_TAG = '销售新客'

export function classifyProjectTags(tagNames: Iterable<string>): CustomerSegmentKey | null {
  const tags = new Set(tagNames)
  if ([...OLD_CUSTOMER_TAGS].some((name) => tags.has(name))) return 'old'
  if (tags.has(NEW_CUSTOMER_TAG)) return 'new'
  return null
}

/** 读取 project_tag_assignment，返回 new / old 项目映射（未分类不在 map 中） */
export async function resolveCustomerSegmentByProjectId(): Promise<Map<string, CustomerSegmentKey>> {
  const rows = await db
    .select({
      projectId: projectTagAssignment.projectId,
      tagName: projectTag.name,
    })
    .from(projectTagAssignment)
    .innerJoin(projectTag, eq(projectTagAssignment.tagId, projectTag.id))

  const tagsByProject = new Map<string, Set<string>>()
  for (const row of rows) {
    const set = tagsByProject.get(row.projectId) ?? new Set<string>()
    set.add(row.tagName)
    tagsByProject.set(row.projectId, set)
  }

  const result = new Map<string, CustomerSegmentKey>()
  for (const [projectId, tags] of tagsByProject) {
    const segment = classifyProjectTags(tags)
    if (segment) result.set(projectId, segment)
  }
  return result
}
