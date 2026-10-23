import "server-only";
import { model, models, Schema, type Model } from "mongoose";

/*
 * Atomic sequence counters (e.g. "certificate:GL:2026"). Incremented with a
 * single findOneAndUpdate($inc, upsert), so concurrent requests always get
 * different numbers. Counters only ever go up: numbers are never reused.
 */

export type CounterRecord = { _id: string; seq: number };

const counterSchema = new Schema<CounterRecord>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { strict: "throw", collection: "counters", versionKey: false },
);

export const CounterModel: Model<CounterRecord> =
  (models.Counter as Model<CounterRecord> | undefined) ?? model<CounterRecord>("Counter", counterSchema);
