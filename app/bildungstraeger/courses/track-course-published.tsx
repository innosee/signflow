"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";

/**
 * Feuert das course_published-Conversion-Event genau einmal nach erfolgreicher
 * Kurs-/Kundenanlage. Die createCourse-Server-Action redirectet auf
 * `…/courses?created=<id>`; hier lesen wir den Param, tracken und entfernen ihn
 * per history.replaceState (kein Re-Fire bei Reload, sauberer URL, kein
 * Navigations-Flackern). window.location statt useSearchParams, um die
 * Suspense-Pflicht zu vermeiden — die Seite ist ohnehin force-dynamic.
 */
export function TrackCoursePublished() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get("created");
    if (!courseId) return;

    track("course_published", { courseId });

    params.delete("created");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : ""),
    );
  }, []);

  return null;
}
