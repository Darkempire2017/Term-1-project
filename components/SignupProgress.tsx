import { Check } from 'lucide-react';

export function SignupProgress({ step }: { step: 2 | 3 }) {
  const steps = ['Scan ID', 'Student details', step === 2 ? 'Complete' : 'Password'];
  return (
    <div className="astrix-progress" aria-label={`Registration step ${step} of 3`}>
      {steps.map((label, index) => (
        <div key={label} className="contents">
          {index > 0 && <span className={`astrix-progress-line ${index < step ? 'complete' : ''}`} aria-hidden="true" />}
          <div className={`astrix-progress-step ${index + 1 === step ? 'active' : ''}`}>
            <span className="astrix-progress-dot" aria-hidden="true">
              {index + 1 < step ? <Check size={17} strokeWidth={3} /> : index + 1}
            </span>
            <span>{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
