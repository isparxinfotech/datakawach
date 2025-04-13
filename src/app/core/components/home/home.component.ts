import { Component, OnInit } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('600ms', style({ opacity: 1 }))
      ])
    ]),
    trigger('cardAnimation', [
      transition(':enter', [
        style({ transform: 'translateY(50px)', opacity: 0 }),
        animate('600ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ]),
    trigger('priceAnimation', [
      transition(':enter', [
        style({ transform: 'scale(0.8)', opacity: 0 }),
        animate('600ms ease-out', style({ transform: 'scale(1)', opacity: 1 }))
      ])
    ])
  ]
})
export class HomeComponent implements OnInit {
  isMenuOpen = false;

  features = [
    {
      icon: 'fas fa-cloud',
      title: 'Secure Cloud Storage',
      description: 'Enterprise-grade encryption for your data'
    },
    {
      icon: 'fas fa-sync',
      title: 'Easy File Restoration',
      description: 'Restore your files with just one click'
    },
    {
      icon: 'fas fa-shield-alt',
      title: 'No Data Loss Guarantee',
      description: '100% guarantee against data loss'
    }
  ];

  pricingPlans = [
    {
      name: 'Basic',
      price: 'Free',
      features: ['5GB Storage', 'Basic Security', 'Email Support']
    },
    {
      name: 'Professional',
      price: '$9.99/mo',
      features: ['50GB Storage', 'Advanced Security', '24/7 Support']
    },
    {
      name: 'Enterprise',
      price: '$29.99/mo',
      features: ['Unlimited Storage', 'Military-grade Security', 'Dedicated Support']
    }
  ];

  constructor() { }

  ngOnInit(): void { }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }
}