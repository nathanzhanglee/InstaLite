class ReactSession {
    static user = null;
  
    static setUser(userData) {
      this.user = userData;
      localStorage.setItem('user', JSON.stringify(userData));
    }
  
    static getUser() {
      if (!this.user) {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          this.user = JSON.parse(storedUser);
        }
      }
      return this.user;
    }
  
    static clearUser() {
      this.user = null;
      localStorage.removeItem('user');
    }
  }
  
  export default ReactSession;