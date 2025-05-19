import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../../../services/chat.service';
import { HttpClient } from '@angular/common/http';
import { interval } from 'rxjs';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {
  isChatOpen = false;
  messages: { text: string; isUser: boolean }[] = [];
  newMessage: string = '';
  userId: string = 'user123'; // Fallback user ID

  constructor(private chatService: ChatService, private http: HttpClient) {
    // Fetch user ID from Spring Boot
    this.http.get<{ userId: string }>('http://localhost:8080/api/user').subscribe({
      next: (data) => {
        this.userId = data.userId;
      },
      error: (error) => {
        console.error('Error fetching user ID:', error);
      }
    });
  }

  ngOnInit() {
    // Poll for replies every 5 seconds
    interval(5000).subscribe(() => {
      this.chatService.getReplies(this.userId).subscribe({
        next: (replies) => {
          replies.forEach((reply: any) => {
            this.messages.push({ text: reply.replyContent, isUser: false });
          });
        },
        error: (error) => console.error('Error fetching replies:', error)
      });
    });
  }

  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
  }

  sendMessage() {
    if (!this.newMessage.trim()) return;

    // Add user message to chat
    this.messages.push({ text: this.newMessage, isUser: true });

    // Send message to Flask backend
    this.chatService.sendMessage(this.userId, this.newMessage).subscribe({
      next: (response) => {
        console.log('Message sent:', response);
      },
      error: (error) => {
        console.error('Error sending message:', error);
        this.messages.push({ text: 'Error: Could not send message', isUser: false });
      }
    });

    this.newMessage = '';
  }
}