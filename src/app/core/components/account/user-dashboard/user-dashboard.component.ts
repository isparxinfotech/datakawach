import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { resourcePermission } from 'src/app/models/api-resp.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';
import { Chart, registerables } from 'chart.js';

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit {
  userName: string | undefined;
  resourceNames: resourcePermission[] = [];
  userSessionDetails: userSessionDetails | null | undefined;

  constructor(private authService: AuthService, private router: Router) {
    Chart.register(...registerables);
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.resourceNames = this.authService.getResourcesAccess();
    this.renderChart();
  }

  renderChart(): void {
    const ctx = document.getElementById('offerChart') as HTMLCanvasElement;
    const offerChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
          {
            label: 'Total Users',
            data: [100, 90, 80, 60, 40, 20, 100, 90, 80, 60, 40, 20],
            borderColor: 'rgb(0, 255, 255)',
            fill: false
          },
          {
            label: 'Total companies',
            data: [80, 70, 60, 50, 40, 30, 80, 70, 60, 50, 40, 30],
            borderColor: 'rgb(255, 183, 0)',
            fill: false
          },
          {
            label: 'Total Offers',
            data: [60, 50, 40, 30, 20, 10, 60, 50, 40, 30, 20, 10],
            borderColor: 'rgb(0, 255, 0)',
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    } else {
      this.authService.logout();
      return false;
    }
  }
}