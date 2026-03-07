import React, { useState } from "react";

const STEPS = [
  {
    title: "Welcome to Family Map",
    description:
      "Keep your loved ones close with real-time location sharing, trip history, and smart alerts.",
    illustration: (
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="#8652FF" opacity="0.08" />
        <circle cx="60" cy="60" r="40" fill="#8652FF" opacity="0.12" />
        <circle cx="40" cy="52" r="10" fill="#8652FF" opacity="0.7" />
        <circle cx="72" cy="48" r="8" fill="#EC4899" opacity="0.7" />
        <circle cx="56" cy="76" r="9" fill="#10B981" opacity="0.7" />
        <text
          x="40"
          y="56"
          textAnchor="middle"
          fill="white"
          fontSize="10"
          fontWeight="bold"
        >
          F
        </text>
        <text
          x="72"
          y="52"
          textAnchor="middle"
          fill="white"
          fontSize="9"
          fontWeight="bold"
        >
          M
        </text>
        <text
          x="56"
          y="80"
          textAnchor="middle"
          fill="white"
          fontSize="9"
          fontWeight="bold"
        >
          K
        </text>
        <path
          d="M40 52L72 48"
          stroke="#8652FF"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.3"
        />
        <path
          d="M72 48L56 76"
          stroke="#8652FF"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.3"
        />
        <path
          d="M56 76L40 52"
          stroke="#8652FF"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.3"
        />
      </svg>
    ),
  },
  {
    title: "Real-Time Location",
    description:
      "See where everyone is on a live map with smooth animations and activity indicators like driving, walking, or at home.",
    illustration: (
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="#8652FF" opacity="0.08" />
        <rect
          x="20"
          y="25"
          width="80"
          height="70"
          rx="8"
          fill="rgba(134,82,255,0.1)"
          stroke="rgba(134,82,255,0.3)"
          strokeWidth="1.5"
        />
        <circle cx="50" cy="55" r="6" fill="#8652FF" />
        <circle cx="75" cy="45" r="5" fill="#EF4444" />
        <circle cx="40" cy="72" r="5" fill="#10B981" />
        <text
          x="50"
          y="58"
          textAnchor="middle"
          fill="white"
          fontSize="7"
          fontWeight="bold"
        >
          A
        </text>
        <path
          d="M50 55L60 45L75 45"
          stroke="#8652FF"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.4"
        />
      </svg>
    ),
  },
  {
    title: "Smart Alerts",
    description:
      "Get notified when family members arrive at or leave places, when battery is low, or if a crash is detected.",
    illustration: (
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="#8652FF" opacity="0.08" />
        <rect
          x="30"
          y="30"
          width="60"
          height="40"
          rx="6"
          fill="white"
          stroke="#8652FF"
          strokeWidth="1.5"
          opacity="0.6"
        />
        <text
          x="60"
          y="46"
          textAnchor="middle"
          fill="#8652FF"
          fontSize="10"
          fontWeight="600"
        >
          📍 Arrived
        </text>
        <text x="60" y="60" textAnchor="middle" fill="#6B7280" fontSize="8">
          at Home · 2:30 PM
        </text>
        <rect
          x="35"
          y="76"
          width="50"
          height="20"
          rx="4"
          fill="rgba(134,82,255,0.15)"
          stroke="rgba(134,82,255,0.3)"
          strokeWidth="1"
        />
        <text
          x="60"
          y="89"
          textAnchor="middle"
          fill="#8652FF"
          fontSize="8"
          fontWeight="600"
        >
          🔋 Low battery
        </text>
      </svg>
    ),
  },
  {
    title: "Privacy Controls",
    description:
      "Pause location sharing or use Bubble mode to show only your approximate area. You're always in control.",
    illustration: (
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="#8652FF" opacity="0.08" />
        <circle
          cx="60"
          cy="55"
          r="25"
          fill="rgba(134,82,255,0.12)"
          stroke="rgba(134,82,255,0.4)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <circle cx="60" cy="55" r="4" fill="#8652FF" opacity="0.6" />
        <text
          x="60"
          y="95"
          textAnchor="middle"
          fill="#8652FF"
          fontSize="9"
          fontWeight="600"
        >
          Approximate area
        </text>
      </svg>
    ),
  },
];

export default function OnboardingWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function handleNext() {
    if (isLast) {
      localStorage.setItem("onboardingDone", "true");
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    localStorage.setItem("onboardingDone", "true");
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-[4000] bg-white dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        {/* Illustration */}
        <div className="flex justify-center mb-6 text-brand-500">
          {current.illustration}
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          {current.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8 max-w-xs mx-auto">
          {current.description}
        </p>

        {/* Step indicators */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? "bg-brand-500 w-6" : "bg-gray-300 dark:bg-gray-600"
              }`}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleNext}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-medium text-sm transition-colors"
          >
            {isLast ? "Get Started" : "Next"}
          </button>
          {!isLast && (
            <button
              onClick={handleSkip}
              className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
