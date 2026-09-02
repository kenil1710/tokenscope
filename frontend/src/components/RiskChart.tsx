"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LineChart as LineChartIcon, Table2 } from "lucide-react";
import { formatDay } from "@/lib/format";
import { DIMENSION_META, RUG_META, scoreTone, TONE_HEX } from "@/lib/risk";
import { DIMENSIONS, type Dimension, type RiskRecord } from "@/types";

/**
 * Series colours for the five dimensions.
 *
 * Assigned in fixed slot order and never cycled, so a dimension keeps its
 * colour whatever else is on screen. Validated as a set against a white
 * surface: every slot sits inside the lightness band and above the chroma
 * floor, worst adjacent CVD ΔE 9.1 and worst adjacent normal-vision ΔE 19.6.
 *
 * Three of them (aqua, yellow, magenta) fall below 3:1 contrast on white, which
 * obliges relief rather than forbidding the colour — hence the legend below the
 * plot AND the table view, either of which identifies a series without relying
 * on colour.
 *
 * Deliberately NOT the app's risk palette. Green/amber/red mean safe, warning
 * and danger everywhere else in TokenScope, and spending those hues on "this is
 * the maturity line" would spend their meaning too.
 */
const SERIES: Record<Dimension, string> = {
  distribution: "#2a78d6",
  activity: "#eb6834",
  verification: "#1baf7a",
  maturity: "#eda100",
  liquidity: "#e87ba4",
};

type Point = {
  label: string;
  seq: number;
  day: string;
  overall: number;
  rug: string;
  distribution: number;
  activity: number;
  verification: number;
  maturity: number;
  liquidity: number;
};

type Mode = "overall" | "dimensions" | "table";

const MODES: { id: Mode; label: string; icon: typeof LineChartIcon }[] = [
  { id: "overall", label: "Overall", icon: LineChartIcon },
  { id: "dimensions", label: "Five dimensions", icon: LineChartIcon },
  { id: "table", label: "Table", icon: Table2 },
];

/**
 * Score history over time.
 *
 * The y-axis is pinned to 0–100 rather than fitted to the data, and that is the
 * single most important decision in this component. An auto-fitted axis turns a
 * three-point wobble into a cliff — precisely the misreading the contract's
 * quantization exists to prevent. Scores live on a fixed 0–100 scale, so the
 * axis shows that scale.
 *
 * One axis, always. The dimensions view puts five series on the same 0–100
 * scale because they ARE the same scale; nothing here is ever plotted against a
 * second y-axis.
 */
export function RiskChart({
  scores,
  capacity,
}: {
  scores: RiskRecord[];
  capacity?: number;
}) {
  const [mode, setMode] = useState<Mode>("overall");

  // `get_risk_history` returns newest first; a time axis reads oldest to newest.
  const data = useMemo<Point[]>(
    () =>
      [...scores]
        .reverse()
        .map((record) => ({
          label: `#${record.seq}`,
          seq: record.seq,
          day: formatDay(record.scored_at),
          overall: record.overall_score,
          rug: record.rug_level,
          distribution: record.distribution_score,
          activity: record.activity_score,
          verification: record.verification_score,
          maturity: record.maturity_score,
          liquidity: record.liquidity_score,
        })),
    [scores],
  );

  if (data.length < 2) return null;

  const latest = data[data.length - 1];
  const first = data[0];
  const overallColour = TONE_HEX[scoreTone(latest.overall)];
  const move = latest.overall - first.overall;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-900">
            {mode === "dimensions"
              ? "The five dimensions across every stored scan"
              : "Overall score across every stored scan"}
          </p>
          <p className="mt-0.5 text-xs text-ink-500">
            {data.length} scans{capacity ? ` of up to ${capacity} kept` : ""} ·{" "}
            {first.day} to {latest.day} ·{" "}
            <span className="tabular">
              {move > 0 ? "+" : ""}
              {move}
            </span>{" "}
            over the window
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-hairline bg-canvas p-1">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              aria-pressed={mode === item.id}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mode === item.id
                  ? "bg-surface text-ink-900 shadow-card"
                  : "text-ink-500 hover:text-ink-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "table" ? (
        <HistoryTable data={data} />
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -18 }}>
              {/* Recessive: horizontal only, so the grid never competes with the
                  lines it exists to help read. */}
              <CartesianGrid stroke="#e3e9f2" strokeDasharray="3 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#5b81ad", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#e3e9f2" }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tick={{ fill: "#5b81ad", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              {/* The two thresholds the badge actually turns on. A reader
                  comparing a line to 75 is comparing it to the rule. */}
              <ReferenceLine y={75} stroke="#10B981" strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={50} stroke="#F59E0B" strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                content={<ScoreTooltip mode={mode} />}
                cursor={{ stroke: "#94b0cf", strokeWidth: 1, strokeDasharray: "3 3" }}
              />

              {mode === "overall" ? (
                <Line
                  type="monotone"
                  dataKey="overall"
                  name="Overall"
                  stroke={overallColour}
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#fff", stroke: overallColour, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "#fff", stroke: overallColour, strokeWidth: 2 }}
                  isAnimationActive
                  animationDuration={700}
                />
              ) : (
                <>
                  <Legend
                    verticalAlign="bottom"
                    height={32}
                    iconType="plainline"
                    wrapperStyle={{ fontSize: 11, color: "#38618c", paddingTop: 8 }}
                  />
                  {DIMENSIONS.map((dimension, i) => (
                    <Line
                      key={dimension}
                      type="monotone"
                      dataKey={dimension}
                      name={DIMENSION_META[dimension].label}
                      stroke={SERIES[dimension]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#fff", stroke: SERIES[dimension], strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: "#fff", stroke: SERIES[dimension], strokeWidth: 2 }}
                      isAnimationActive
                      animationDuration={600}
                      animationBegin={i * 80}
                    />
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-500">
        The axis is pinned to 0–100, never fitted to the data. An axis that hugs its own
        range turns a three-point wobble into a cliff — exactly the misreading the
        contract&rsquo;s quantization exists to prevent. The dashed guides sit at 75 and
        50, the two thresholds the badge actually turns on.
      </p>
    </div>
  );
}

type TooltipPayload = { payload?: Point }[];

/** Crosshair tooltip. Shows the whole record at that scan, not just the hovered
 *  series — the useful question at a point in time is "what did this token look
 *  like then", and every number for that scan is already in the row. */
function ScoreTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  mode?: Mode;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const rug = RUG_META[point.rug as keyof typeof RUG_META];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-3 shadow-lift">
      <p className="text-xs font-semibold text-ink-900">
        Scan {point.label} · {point.day}
      </p>
      <p className="tabular mt-1 text-lg font-semibold text-ink-900">
        {point.overall}
        <span className="ml-1.5 text-xs font-normal text-ink-500">overall</span>
      </p>
      <ul className="mt-2 space-y-1 border-t border-hairline pt-2">
        {DIMENSIONS.map((dimension) => (
          <li key={dimension} className="flex items-center gap-2 text-[11px]">
            <span
              className="size-2 shrink-0 rounded-sm"
              style={{ background: SERIES[dimension] }}
              aria-hidden
            />
            <span className="text-ink-600">{DIMENSION_META[dimension].label}</span>
            <span className="tabular ml-auto font-semibold text-ink-900">
              {point[dimension]}
            </span>
          </li>
        ))}
      </ul>
      {mode === "overall" && rug ? (
        <p className="mt-2 border-t border-hairline pt-2 text-[11px] text-ink-500">
          Rug risk: {rug.label}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The same data as a table.
 *
 * Not a fallback — a peer view. Three of the five series colours sit below 3:1
 * contrast on this surface, and the rule for that is relief: an identification
 * route that does not depend on colour at all. This is it.
 */
function HistoryTable({ data }: { data: Point[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-hairline text-ink-400">
            <th scope="col" className="py-2 pr-3 font-semibold">Scan</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Overall</th>
            {DIMENSIONS.map((dimension) => (
              <th key={dimension} scope="col" className="py-2 pr-3 text-right font-semibold">
                {DIMENSION_META[dimension].label}
              </th>
            ))}
            <th scope="col" className="py-2 font-semibold">Rug</th>
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((point) => (
            <tr key={point.seq} className="border-b border-hairline/60">
              <td className="py-2 pr-3 font-mono text-ink-500">{point.label}</td>
              <td className="py-2 pr-3 text-ink-600">{point.day}</td>
              <td className="tabular py-2 pr-3 text-right font-semibold text-ink-900">
                {point.overall}
              </td>
              {DIMENSIONS.map((dimension) => (
                <td key={dimension} className="tabular py-2 pr-3 text-right text-ink-700">
                  {point[dimension]}
                </td>
              ))}
              <td className="py-2 text-ink-600">
                {RUG_META[point.rug as keyof typeof RUG_META]?.label ?? point.rug}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
