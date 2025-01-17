import { Component } from '@angular/core';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
  isSidebarOpen: boolean = false; // State to track sidebar visibility

  // Method to open the sidebar
  openSidebar() {
    this.isSidebarOpen = true;
  }

  // Method to close the sidebar
  closeSidebar() {
    this.isSidebarOpen = false;
  }
}
