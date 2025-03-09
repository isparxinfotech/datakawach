import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private alertMessages = new BehaviorSubject<{ type: string, message: string }[]>([]);
  alerts$ = this.alertMessages.asObservable();

  showAlert(type: 'success' | 'error' | 'info', message: string) {
    const currentAlerts = this.alertMessages.getValue();
    this.alertMessages.next([...currentAlerts, { type, message }]);

    // Auto-remove alert after 5 seconds
    setTimeout(() => this.removeAlert(), 5000);
  }

  removeAlert() {
    const currentAlerts = this.alertMessages.getValue();
    currentAlerts.shift();
    this.alertMessages.next([...currentAlerts]);
  }
}
