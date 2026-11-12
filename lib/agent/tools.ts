import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "./defineTool";
import { getSupabase } from "../supabase";
import { isoDate } from "../schemas";
import { CURRENT_USER_ID } from "../currentUser";

const MAX_RESULTS = 20;

/** Normalizes a Supabase joined relation that may be returned as an object or single-element array. */
function unwrapJoin<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null;
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function includesLanguage(languages: string[] | null | undefined, target: string): boolean {
  const needle = target.trim().toLowerCase();
  if (!needle) return true;
  return (languages ?? []).some((lang) => lang.toLowerCase() === needle);
}

const searchDoctors = defineTool({
  name: "searchDoctors",
  description:
    "Use this when the patient asks about doctors, departments, symptoms, or languages spoken. Can filter by symptomOrDepartment and/or language. Returns at most 20 matching doctors.",
  schema: z.object({
    symptomOrDepartment: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Symptom, health issue, department name, or doctor name to search for"),
    language: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Preferred language spoken by the doctor (for example Tamil, Hindi, English)"),
  }),
  run: async ({ symptomOrDepartment, language }) => {
    const { data, error } = await getSupabase()
      .from("doctors")
      .select(
        "id, name, qualification, experience_years, consultation_fee, languages, room, departments(name, common_issues)"
      )
      .order("id", { ascending: true });

    if (error) throw new Error(error.message);

    const query = symptomOrDepartment?.trim().toLowerCase();

    const doctors = (data ?? [])
      .map((doc) => {
        const dept = unwrapJoin(doc.departments);
        return {
          id: doc.id,
          name: doc.name,
          department: dept?.name ?? null,
          common_issues: dept?.common_issues ?? "",
          qualification: doc.qualification,
          experience_years: doc.experience_years,
          consultation_fee: doc.consultation_fee,
          languages: doc.languages,
          room: doc.room,
        };
      })
      .filter((doc) => {
        if (query) {
          const matchesQuery =
            doc.name.toLowerCase().includes(query) ||
            (doc.department ?? "").toLowerCase().includes(query) ||
            doc.common_issues.toLowerCase().includes(query);
          if (!matchesQuery) return false;
        }
        if (language && !includesLanguage(doc.languages, language)) {
          return false;
        }
        return true;
      })
      .slice(0, MAX_RESULTS)
      .map(({ common_issues: _commonIssues, ...rest }) => rest);

    return { count: doctors.length, doctors };
  },
});

const getAvailableSlots = defineTool({
  name: "getAvailableSlots",
  description:
    "Use this when the patient wants to check available appointment slots. Can filter by doctorId, date (YYYY-MM-DD), and/or language. Returns at most 20 upcoming open slots.",
  schema: z.object({
    doctorId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Doctor ID to filter slots by (for example DR01)"),
    date: isoDate
      .optional()
      .describe("Specific appointment date in YYYY-MM-DD format"),
    language: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Preferred language spoken by the doctor"),
  }),
  run: async ({ doctorId, date, language }) => {
    const today = new Date().toISOString().slice(0, 10);

    let query = getSupabase()
      .from("slots")
      .select("id, doctor_id, slot_date, start_time, doctors(name, department_id, languages, room)")
      .eq("is_booked", false)
      .gte("slot_date", today)
      .order("slot_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (doctorId) query = query.eq("doctor_id", doctorId);
    if (date) query = query.eq("slot_date", date);
    if (!language) query = query.limit(MAX_RESULTS);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const slots = (data ?? [])
      .map((slot) => {
        const doc = unwrapJoin(slot.doctors);
        return {
          id: slot.id,
          doctor_id: slot.doctor_id,
          doctor_name: doc?.name ?? null,
          room: doc?.room ?? null,
          slot_date: slot.slot_date,
          start_time: slot.start_time,
          _languages: doc?.languages ?? [],
        };
      })
      .filter((slot) => !language || includesLanguage(slot._languages, language))
      .slice(0, MAX_RESULTS)
      .map(({ _languages, ...rest }) => rest);

    return { count: slots.length, slots };
  },
});

const getMyAppointments = defineTool({
  name: "getMyAppointments",
  description:
    "Use this when the patient wants to view their own booked, cancelled, or completed appointments. Returns at most 20 appointments, newest first.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("appointments")
      .select(
        "id, doctor_id, slot_id, reason, status, doctors(name, department_id, room, consultation_fee), slots(slot_date, start_time)"
      )
      .eq("patient_id", CURRENT_USER_ID)
      .order("created_at", { ascending: false })
      .limit(MAX_RESULTS);

    if (error) throw new Error(error.message);

    const appointments = (data ?? []).map((appt) => {
      const doc = unwrapJoin(appt.doctors);
      const slot = unwrapJoin(appt.slots);
      return {
        id: appt.id,
        doctor_id: appt.doctor_id,
        doctor_name: doc?.name ?? null,
        room: doc?.room ?? null,
        slot_id: appt.slot_id,
        slot_date: slot?.slot_date ?? null,
        start_time: slot?.start_time ?? null,
        reason: appt.reason,
        status: appt.status,
      };
    });

    return { count: appointments.length, appointments };
  },
});

/** Every tool in this list is given to Gemini. */
export const tools: AgentTool[] = [searchDoctors, getAvailableSlots, getMyAppointments];
