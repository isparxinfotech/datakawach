import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {
isAuthUser!: boolean;
  constructor(private authService: AuthService) {
    if (this.authService.isAuthenticated()) {
      this.isAuthUser = true;
    }
   else
   {
     this.isAuthUser = false;
     }
  }
  ngOnInit(): any{
  console.log("footer called");
  }
}
