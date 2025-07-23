// Step executor base class
export class StepExecutor {
  constructor(type) {
    this.type = type;
  }

  async execute(step, context, inputData) {
    throw new Error(`Execute method not implemented for step type: ${this.type}`);
  }

  async validate(stepConfig) {
    return { valid: true, errors: [] };
  }
}

export default StepExecutor;