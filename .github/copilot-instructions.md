# CareSlot — PS3 Clinic Appointment Agent

## Project Overview

- **Project**: PS3 Clinic Appointment Agent (CareSlot)
- **Business User**: Clinic patient
- **Logged-in User**: `P001` (Arjun Mehta), retrieved from `lib/currentUser.ts`

## Tech Stack

- **Framework**: Next.js App Router, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (server-side only, using `SUPABASE_SECRET_KEY`)
- **AI / Function Calling**: Gemini function calling (`@google/genai`)
- **Validation**: Zod

## Database Schema (Supabase Tables)

- `departments` (`id`, `name`, `common_issues`)
- `doctors` (`id`, `name`, `department_id`, `qualification`, `experience_years`, `consultation_fee`, `languages`, `room`)
- `slots` (`id`, `doctor_id`, `slot_date`, `start_time`, `is_booked`)
- `patients` (`id`, `name`, `phone`, `age`, `city`)
- `appointments` (`id`, `patient_id`, `doctor_id`, `slot_id`, `reason`, `status`, `created_at`)

## Agent Tools & Conventions

- All agent tools live in `lib/agent/tools.ts` and are defined using `defineTool()` with a Zod schema.
- Every tool description must start with `"Use this when..."`.
- The logged-in user ID comes from `lib/currentUser.ts`. **Never** pass `patient_id` as a tool argument.

## Business Rules

- A slot can be booked only once (`is_booked = false` and `slot_date >= today`).
- **Booking**: sets `slots.is_booked = true`.
- **Cancelling**: sets `appointments.status = 'cancelled'` and `slots.is_booked = false`.
- **Rescheduling**: frees the old slot (`is_booked = false`) and locks the new slot (`is_booked = true`).

## Safety & Security Rules

- **Medical Safety**: Never diagnose or suggest medicine. Only help with appointments.
- **Secrets**: Never use `SUPABASE_SECRET_KEY` in frontend components. Never commit `.env.local`.

