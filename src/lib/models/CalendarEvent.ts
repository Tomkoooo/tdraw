import mongoose, { Schema, Document } from "mongoose";

export type CalendarScope = "personal" | "org";

export interface ICalendarEvent extends Document {
  scope: CalendarScope;
  organizationId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  participantUserIds: mongoose.Types.ObjectId[];
  /** Email-only guests (personal invites); not validated as users. */
  guestEmails: string[];
  location?: string;
  /** Minutes before start to remind (null = none). */
  reminderMinutesBefore?: number | null;
  createdByUserId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema = new Schema(
  {
    scope: { type: String, enum: ["personal", "org"], required: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 4000 },
    start: { type: Date, required: true, index: true },
    end: { type: Date, required: true },
    participantUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    guestEmails: [{ type: String, trim: true, lowercase: true, maxlength: 320 }],
    location: { type: String, trim: true, maxlength: 500 },
    reminderMinutesBefore: { type: Number, min: 0, max: 10080 },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CalendarEventSchema.index({ organizationId: 1, start: 1 });
CalendarEventSchema.index({ createdByUserId: 1, start: 1 });

export default mongoose.models.CalendarEvent || mongoose.model<ICalendarEvent>("CalendarEvent", CalendarEventSchema);
