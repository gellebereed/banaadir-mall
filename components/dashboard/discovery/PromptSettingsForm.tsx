"use client";

import { useState } from "react";
import { updatePromptSettings } from "@/app/actions";
import SafeForm from "@/components/dashboard/SafeForm";
import SubmitButton from "@/components/dashboard/SubmitButton";
import type { RecoSettings } from "@/lib/types";

/**
 * What shoppers get asked.
 *
 * Three questions, each of which pays for the interruption:
 *
 *   DEPARTMENTS is the one that matters. A first-time visitor's home page
 *   is generic because there is nothing to personalise from; one answer
 *   fixes that on the visit it was given, not the fifth.
 *
 *   BUDGET is a follow-up, never asked in the same session — two onboarding
 *   questions back to back is a survey, and people close surveys.
 *
 *   REVIEW is the only way this marketplace gets real reviews. It only
 *   fires for a product in a DELIVERED order belonging to that shopper.
 *
 * There is no gender question and there will not be one. It is a worse
 * predictor than departments (people buy gifts), it forces a personal
 * disclosure a shop has no need for, and it produces one bit of signal
 * where the department question produces several.
 */
export default function PromptSettingsForm({ settings }: { settings: RecoSettings }) {
  const prompts = settings.prompts;
  const [enabled, setEnabled] = useState(prompts.enabled);
  const [delay, setDelay] = useState(prompts.delaySeconds);

  return (
    <SafeForm action={updatePromptSettings} className="space-y-5">
      <section className="card p-5 sm:p-6">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            name="promptsEnabled"
            defaultChecked={prompts.enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-ocean-700"
          />
          <span>
            <span className="font-display font-bold text-ocean-950">
              Shopper prompts are {enabled ? "on" : "off"}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              A single card slides in at the corner — never a full-screen
              overlay, never on the cart or checkout, and never more than one
              at a time. Dismissing one puts it away for the cooldown below.
            </span>
          </span>
        </label>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Which questions</h2>

        <div className="mt-4 space-y-3">
          <Toggle
            name="askDepartments"
            defaultChecked={prompts.askDepartments}
            title="“What are you shopping for?”"
            body="Departments, multi-select. Asked after they've opened two products, so it reads as a shop paying attention rather than a gate on the door. The single most valuable answer you can get."
          />
          <Toggle
            name="askBudget"
            defaultChecked={prompts.askBudget}
            title="“What's your usual range?”"
            body="A price band. Only asked to shoppers who already answered the departments question, and never in the same session."
          />
          <Toggle
            name="askReview"
            defaultChecked={prompts.askReview}
            title="“How was it?”"
            body="A star rating and an optional line, for a product in an order that was actually DELIVERED to them. This is where your real reviews come from — the generated samples stop showing on a product the moment it has one."
          />
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <h2 className="font-display font-bold text-ocean-950">Timing</h2>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="delaySeconds">
              Wait before asking — {delay}s
            </label>
            <input
              id="delaySeconds"
              type="range"
              name="delaySeconds"
              min={5}
              max={180}
              step={5}
              value={delay}
              onChange={(event) => setDelay(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-sand-200 accent-mango-500"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {delay < 20
                ? "Very early. Most shoppers won't have looked at anything yet."
                : delay < 60
                  ? "After they've settled in — the usual choice."
                  : "Late. Only engaged shoppers will ever see it."}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="cooldownDays">
              Leave it alone for
            </label>
            <div className="flex items-center gap-2">
              <input
                id="cooldownDays"
                type="number"
                name="cooldownDays"
                min={1}
                max={365}
                defaultValue={prompts.cooldownDays}
                className="input"
              />
              <span className="shrink-0 text-sm font-semibold text-slate-500">days</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              How long a dismissed question stays away. Answered ones are
              never asked again at all.
            </p>
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <SubmitButton>Save prompt settings</SubmitButton>
      </div>
    </SafeForm>
  );
}

function Toggle({
  name,
  defaultChecked,
  title,
  body,
}: {
  name: string;
  defaultChecked: boolean;
  title: string;
  body: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-sand-200 bg-sand-50/60 p-4">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-ocean-700"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{body}</span>
      </span>
    </label>
  );
}
