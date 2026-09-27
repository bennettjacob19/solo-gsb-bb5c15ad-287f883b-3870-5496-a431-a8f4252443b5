export interface Evidence {
  id: string;
  title: string;
  description: string;
  source: string;
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Edge {
  id: number;
  /** 前置证据：必须更早发生 */
  fromId: string;
  /** 后续证据：必须更晚发生 */
  toId: string;
  createdAt: string;
}

export interface GraphState {
  evidence: Evidence[];
  edges: Edge[];
  /** 每张卡片所在的拓扑层级（0 起），由「必须早于」约束推导 */
  levels: Record<string, number>;
  levelCount: number;
}

/** 一条冗余连线及其最短替代路径（传递约简分析结果） */
export interface RedundantEdge {
  edgeId: number;
  fromId: string;
  toId: string;
  /** 忽略该连线后，从 fromId 到 toId 的一条最短替代路径（节点 id 序列，含起终点） */
  path: string[];
}

export interface RedundancyReport {
  redundant: RedundantEdge[];
}

/** 批量瘦身结果：最新全量状态 + 实际移除 / 被跳过的连线 id */
export interface PruneResult extends GraphState {
  pruned: number[];
  skipped: number[];
}

/** 合并失败原因：改接后产生自环 / 有向环 */
export type MergeConflictKind = 'self-loop' | 'cycle';

/** 合并冲突：当前图中导致改接失败的一条真实路径（自环时为两端点） */
export interface MergeConflict {
  kind: MergeConflictKind;
  path: string[];
}

/** 顺序确定性查询的判定结论 */
export type OrderRelation = 'a-before-b' | 'b-before-a' | 'unconstrained';

/** 一个方向的见证布局：附加「firstId 必须早于 secondId」约束后的合法拓扑 */
export interface OrderWitness {
  firstId: string;
  secondId: string;
  /** 合法拓扑序（并列节点按创建时间、再按 id 稳定排序） */
  order: string[];
  /** 附加见证约束后的拓扑层级（供前端临时预览画布布局，不写数据库） */
  levels: Record<string, number>;
  levelCount: number;
}

/** 顺序确定性查询结果 */
export interface OrderQueryResult {
  aId: string;
  bId: string;
  relation: OrderRelation;
  /** relation 为 a-before-b / b-before-a 时：从先到后的一条最短约束路径（含两端点） */
  path: string[] | null;
  /** relation 为 unconstrained 时：双向见证 */
  witnesses: { aFirst: OrderWitness; bFirst: OrderWitness } | null;
}

/** 必经证据分析结果（只读） */
export interface MustPassResult {
  aId: string;
  bId: string;
  /** A 是否能沿现有「必须早于」连线到达 B */
  reachable: boolean;
  /** 是否存在 A → B 直接连线（有则必经中间卡片必为空） */
  direct: boolean;
  /** 所有 A→B 路径共同经过的中间卡片（必经证据），按约束先后排序 */
  mustPass: string[];
  /** 位于某条 A→B 路径但并非必经的中间卡片（存在绕开它的真实路径），按约束先后排序 */
  optional: string[];
}

/** 绕开指定中间卡片的真实 A→B 路径核对结果 */
export interface BypassPathResult {
  aId: string;
  bId: string;
  skipId: string;
  /** 绕开 skipId 的一条最短 A→B 真实路径（含两端点）；不存在（该卡片实为必经）时为 null */
  path: string[] | null;
}
