import { Component } from '@angular/core';
import { resourcePermission } from 'src/app/models/api-resp.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-dynamic-menus',
  templateUrl: './dynamic-menus.component.html',
  styleUrls: ['./dynamic-menus.component.css']
})
export class DynamicMenusComponent {
  resourceNames: resourcePermission[] = [];
    constructor(private authService: AuthService) {
  }
  ngOnInit(): void {
    this.resourceNames = this.authService.getResourcesAccess();
    console.log(this.resourceNames);
  }
}
