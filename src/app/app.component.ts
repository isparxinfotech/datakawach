import { Component, OnInit } from '@angular/core';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'HRKUI';
  isAuthUser!: boolean;
  constructor(private authService: AuthService, private router: Router) {
    if (this.authService.isAuthenticated()) {
      this.isAuthUser = true;
    } 
   else
   {
     this.isAuthUser = false;
     }
  }
    
}
