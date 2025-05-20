import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private flaskApiUrl = 'http://13.127.44.80:5000/chatbot-api';
  // For production: private flaskApiUrl = 'https://www.datakavach.com/chatbot-api';

  constructor(private http: HttpClient) {}

  sendMessage(userId: string, message: string): Observable<any> {
    return this.http.post(`${this.flaskApiUrl}/send-message`, { userId, message });
  }

  getReplies(userId: string): Observable<any> {
    return this.http.get(`${this.flaskApiUrl}/get-replies/${userId}`);
  }
}