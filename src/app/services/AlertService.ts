import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  showAlert(type: string, message: string): void {
    console.log(`${type}: ${message}`); // Placeholder implementation
  }
}