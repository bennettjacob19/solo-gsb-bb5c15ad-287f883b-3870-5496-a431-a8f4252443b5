import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { GraphState, TimeWindowHighlight, TimeWindowResult } from '../types';

interface TimeWindowPanelProps {
  state: GraphState;
  titleOf: (id: string) => string;
  /** 把当前高亮视图同步给画布（冲突路径 / 越界固定卡定位） */
  onHighlight: (h: TimeWindowHighlight | null) => void;
}

function fmtMinute(iso: string): string {
  return iso.replace('T', ' ').slice(0, 16);
}

/** 滚动到画布上的指定卡片（用于定位越界固定卡 / 冲突卡） */
function scrollToCard(id: string): void {
  requestAnimationFrame(() => {
    document.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/**
 * 时间窗口分析面板（只读）：输入事故起止时间与最小间隔（≥1 分钟整数），
 * 服务端沿现有「必须早于」有向无环图双向传播时间上下界，列出每张卡片所有可行赋时中的最早、最晚时刻；
 * 无解时给出导致上下界冲突的真实约束路径（画布高亮）或定位越出事故区间的固定卡。
 * 分析不改写卡片或连线；图或输入变化后清除旧结果。
 */
export default function TimeWindowPanel(props: TimeWindowPanelProps) {
  const { state, titleOf } = props;
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [gap, setGap] = useState('10');
  const [result, setResult] = useState<TimeWindowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 冲突高亮开关（无解结果自动打开，可手动关闭） */
  const [hlOn, setHlOn] = useState(false);

  const onHighlightRef = useRef(props.onHighlight);
  onHighlightRef.current = props.onHighlight;

  /* 把当前高亮视图同步给画布 */
  useEffect(() => {
    if (result && !result.feasible && hlOn && result.conflict) {
      const c = result.conflict;
      onHighlightRef.current(
        c.kind === 'bounds' ? { kind: 'bounds', path: c.path } : { kind: 'fixed-out-of-range', cardId: c.cardId },
      );
    } else {
      onHighlightRef.current(null);
    }
  }, [result, hlOn]);

  /* 图状态变化后，上次分析结果即过期 */
  useEffect(() => {
    setResult(null);
    setErr(null);
    setHlOn(false);
  }, [state]);

  /* Esc 取消高亮 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHlOn(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* 输入变化后清除旧结果 */
  const clearResult = () => {
    setResult(null);
    setErr(null);
    setHlOn(false);
  };

  const gapValid = /^\d+$/.test(gap.trim()) && Number(gap.trim()) >= 1;
  const canQuery = start !== '' && end !== '' && gapValid && !loading;

  const query = async () => {
    if (!canQuery) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await api.timeWindow(start, end, Number(gap.trim()));
      setResult(r);
      // 无解时自动在画布高亮冲突路径 / 定位越界固定卡
      setHlOn(!r.feasible && r.conflict !== null);
      if (!r.feasible && r.conflict) scrollToCard(r.conflict.cardId);
    } catch (e) {
      setResult(null);
      setHlOn(false);
      setErr(e instanceof ApiError ? e.message : '分析失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  /* 可行窗口按最早时刻、再按最晚时刻、再按标题排序展示 */
  const sortedCards = useMemo(() => {
    if (!result?.feasible) return [];
    return [...result.cards].sort(
      (x, y) =>
        x.earliest.localeCompare(y.earliest) ||
        x.latest.localeCompare(y.latest) ||
        titleOf(x.id).localeCompare(titleOf(y.id), 'zh'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const conflict = result && !result.feasible ? result.conflict : null;

  return (
    <section className="timewin-panel">
      <div className="timewin-head">
        <h2>时间窗口分析</h2>
        <p className="muted">
          输入事故起止时间（闭区间）与最小间隔（≥1 分钟的整数）：所有卡片都必须落在该区间内，已有发生时间的卡片为固定时刻，每条「必须早于」连线要求后卡至少晚于前卡该间隔。服务端沿现有约束图双向传播时间上下界，给出每张卡片所有可行赋时中的最早、最晚时刻；无解时指出导致冲突的真实约束路径（画布红色高亮）或定位越出区间的固定卡。分析只读，不改写卡片或连线；图或输入变化后结果自动清除。
        </p>
      </div>
      <div className="timewin-controls">
        <label className="timewin-field">
          事故开始
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              clearResult();
            }}
            aria-label="事故开始时间"
          />
        </label>
        <label className="timewin-field">
          事故结束
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              clearResult();
            }}
            aria-label="事故结束时间"
          />
        </label>
        <label className="timewin-field timewin-gap">
          最小间隔（分钟）
          <input
            type="number"
            min={1}
            step={1}
            value={gap}
            onChange={(e) => {
              setGap(e.target.value);
              clearResult();
            }}
            aria-label="最小间隔（分钟）"
          />
        </label>
        <button type="button" className="btn primary" onClick={query} disabled={!canQuery}>
          {loading ? '分析中…' : '分析时间窗口'}
        </button>
        {gap.trim() !== '' && !gapValid && <span className="muted">最小间隔须为 ≥1 的整数</span>}
      </div>
      {err && <div className="order-error">⚠ {err}</div>}
      {result && (
        <div className="timewin-result">
          {result.feasible && (
            <>
              <div className="timewin-verdict">
                事故窗口 <b>{fmtMinute(result.start)} ~ {fmtMinute(result.end)}</b> · 最小间隔{' '}
                <b>{result.minGapMinutes} 分钟</b>：全部 {result.cards.length} 张卡片均存在可行赋时，窗口如下（固定卡最早 = 最晚）。
              </div>
              <div className="timewin-list">
                {sortedCards.map((c) => (
                  <div className="timewin-row" key={c.id}>
                    <span className="timewin-title">{titleOf(c.id)}</span>
                    {c.fixed ? <span className="timewin-chip fixed">固定</span> : <span className="timewin-chip">待排</span>}
                    <span className="timewin-range">
                      最早 <b>{fmtMinute(c.earliest)}</b> · 最晚 <b>{fmtMinute(c.latest)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {conflict?.kind === 'bounds' && (
            <>
              <div className="timewin-verdict">
                无可行窗口：沿冲突路径推导，「<b>{titleOf(conflict.cardId)}</b>」最早为{' '}
                <b>{fmtMinute(conflict.earliest)}</b>，却又必须不晚于 <b>{fmtMinute(conflict.latest)}</b>
                ——下界超过上界，约束彼此矛盾。
              </div>
              <div className="timewin-conflict-path">
                冲突路径（相邻均为真实「必须早于」连线）：{conflict.path.map(titleOf).join(' → ')}
              </div>
              <div>
                <button
                  type="button"
                  className={`btn small${hlOn ? ' active' : ''}`}
                  onClick={() => {
                    setHlOn(!hlOn);
                    if (!hlOn) scrollToCard(conflict.cardId);
                  }}
                  title="在画布上以红色高亮导致冲突的约束路径"
                >
                  {hlOn ? '取消高亮' : '在画布高亮冲突路径'}
                </button>
              </div>
            </>
          )}
          {conflict?.kind === 'fixed-out-of-range' && (
            <>
              <div className="timewin-verdict">
                无可行窗口：「<b>{titleOf(conflict.cardId)}</b>」的固定发生时间{' '}
                <b>{fmtMinute(conflict.occurredAt)}</b> 越出事故区间{' '}
                <b>
                  {fmtMinute(result!.start)} ~ {fmtMinute(result!.end)}
                </b>
                。请调整事故区间，或核对卡片时间。
              </div>
              <div>
                <button
                  type="button"
                  className={`btn small${hlOn ? ' active' : ''}`}
                  onClick={() => {
                    setHlOn(true);
                    scrollToCard(conflict.cardId);
                  }}
                  title="在画布上定位并高亮该卡片"
                >
                  定位该卡片
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
