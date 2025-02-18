import { Component, AfterViewInit } from '@angular/core';
import { Chart } from 'chart.js/auto';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent {

  
  ngAfterViewInit() {
    this.createBarChart();
    this.createLineChart();
  }

  createBarChart() {
    new Chart('barChart', {
      type: 'bar',
      data: {
        labels: ['Jan', 'meb', 'Mar', 'Apr', 'May'],
        datasets: [
          {
            label: 'Restore',
            data: [12000, 15000, 8000, 18000, 10000],
            backgroundColor: 'rgba(103, 58, 183, 0.5)',
          }
        ]
      }
    });
  }

  createLineChart() {
    new Chart('lineChart', {
      type: 'line',
      data: {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        datasets: [
          {
            label: 'Backup',
            data: [11000, 9500, 14500, 12500, 16000],
            borderColor: '#673ab7',
            fill: false
          }
        ]
      }
    });
  }

}
