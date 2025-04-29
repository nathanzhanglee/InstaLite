import axios from 'axios';
import config from '../../config.json';

const rootURL = config.serverRootURL;

class ActivityTracker {
  constructor() {
    this.intervalId = null;
    this.updateInterval = 1000; // 1 sec
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    this.beforeUnloadHandler = this.handleBeforeUnload.bind(this);
  }

  startTracking() {
    this.updateActivity();
    
    this.intervalId = setInterval(() => {
      this.updateActivity();
    }, this.updateInterval);
    
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
    
    console.log('Activity tracking started');
  }

  stopTracking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Remove event listeners
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    
    console.log('Activity tracking stopped');
  }

  updateActivity() {
    axios.post(`${rootURL}/updateActivity`, {}, { 
      withCredentials: true 
    })
    .then(response => {
      // Success
    })
    .catch(err => {
      console.error('Failed to update activity:', err);
      // If this is a 403 Not logged in error, redirect to login
      if (err.response && err.response.status === 403) {
        window.location.href = '/login';
      }
    });
  }

  handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      this.updateActivity();
    } else if (document.visibilityState === 'hidden') {
      this.updateActivity();
    }
  }

  handleBeforeUnload(event) {
    const endpoint = `${rootURL}/updateActivity`;
    navigator.sendBeacon(endpoint);
  }
}

const activityTracker = new ActivityTracker();
export default activityTracker;