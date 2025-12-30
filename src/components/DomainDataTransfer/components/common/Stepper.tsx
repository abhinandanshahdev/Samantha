import React from 'react';
import './Stepper.css';

interface Step {
  label: string;
  completed: boolean;
  active: boolean;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

const Stepper: React.FC<StepperProps> = ({ steps, currentStep }) => {
  return (
    <div className="stepper">
      {steps.map((step, index) => (
        <React.Fragment key={index}>
          <div className={`stepper-step ${step.active ? 'active' : ''} ${step.completed ? 'completed' : ''}`}>
            <div className="stepper-circle">
              {step.completed ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <span>{index + 1}</span>
              )}
            </div>
            <span className="stepper-label">{step.label}</span>
          </div>
          {index < steps.length - 1 && (
            <div className={`stepper-connector ${steps[index + 1].active || steps[index + 1].completed ? 'active' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Stepper;
