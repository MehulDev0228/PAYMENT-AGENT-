"use client";

import { Compass } from "lucide-react";
import { startTour } from "./shell/product-tour";

export function TourButton() {
  return <button type="button" onClick={startTour} className="btn-primary"><Compass size={15} aria-hidden="true" /> Take the 1-minute tour</button>;
}
