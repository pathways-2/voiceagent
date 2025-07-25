class Timer {
  constructor() {
    this.timers = new Map();
  }

  start(label) {
    this.timers.set(label, {
      startTime: Date.now(),
      startHrTime: process.hrtime.bigint()
    });
  }

  end(label) {
    const timer = this.timers.get(label);
    if (!timer) {
      console.warn(`⏱️ Timer "${label}" not found`);
      return null;
    }

    const endTime = Date.now();
    const endHrTime = process.hrtime.bigint();
    
    const duration = endTime - timer.startTime;
    const precisionDuration = Number(endHrTime - timer.startHrTime) / 1000000; // Convert nanoseconds to milliseconds

    this.timers.delete(label);

    const result = {
      label,
      duration: duration,
      precisionDuration: Math.round(precisionDuration * 100) / 100, // Round to 2 decimal places
      timestamp: new Date().toISOString()
    };

    console.log(`⏱️ [${label}] ${result.precisionDuration}ms`);
    return result;
  }

  // Async wrapper function to time async operations
  async timeAsync(label, asyncFunction) {
    this.start(label);
    try {
      const result = await asyncFunction();
      this.end(label);
      return result;
    } catch (error) {
      this.end(label);
      throw error;
    }
  }

  // Get all active timers (for debugging)
  getActiveTimers() {
    return Array.from(this.timers.keys());
  }
}

// Create a global timer instance
const globalTimer = new Timer();

module.exports = {
  Timer,
  globalTimer
}; 