import { Component, OnInit } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import emailjs from '@emailjs/browser';

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
    ]),
    trigger('popupAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.7)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'scale(0.7)' }))
      ])
    ])
  ]
})
export class HomeComponent implements OnInit {
  isMenuOpen = false;
  isContactFormOpen = false;
  isSubmitting = false;

  contactData = {
    formType: '',
    // Company fields
    companyName: '',
    panNumber: '',
    totalUsers: null as number | null,
    contactNumber: '',
    contactPerson: '',
    companyAddress: '',
    companyEmail: '',
    // Personal fields
    fullName: '',
    occupation: '',
    storageNeeded: null as number | null,
    personalAddress: '',
    personalPhone: '',
    personalEmail: ''
  };

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
      name: 'Professional',
      price: '₹19999/-Year',
      features: ['1TB Storage', 'Advanced Security', '24/7 Support']
    },
    {
      name: 'Enterprise',
      price: '₹29999/-Year',
      features: ['5TB Storage', 'Military-grade Security', 'Dedicated Support']
    }
  ];

  constructor() { }

  ngOnInit(): void {
    emailjs.init({
      publicKey: 'edjBReV-xD-W_FME5' // Replace with your EmailJS Public Key
    });
    // Add event listener for keydown to block dev tools shortcuts
    document.addEventListener('keydown', this.disableDevTools.bind(this));
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  openContactForm(): void {
    this.isContactFormOpen = true;
  }

  closeContactForm(): void {
    this.isContactFormOpen = false;
    this.resetFormFields();
  }

  resetFormFields(): void {
    this.contactData = {
      formType: this.contactData.formType,
      companyName: '',
      panNumber: '',
      totalUsers: null,
      contactNumber: '',
      contactPerson: '',
      companyAddress: '',
      companyEmail: '',
      fullName: '',
      occupation: '',
      storageNeeded: null,
      personalAddress: '',
      personalPhone: '',
      personalEmail: ''
    };
  }

  async submitContactForm(): Promise<void> {
    this.isSubmitting = true;
    try {
      let templateParams: any;
      const isCompany = this.contactData.formType === 'company';

      if (isCompany) {
        const requiredFields = [
          this.contactData.companyName,
          this.contactData.panNumber,
          this.contactData.totalUsers,
          this.contactData.contactNumber,
          this.contactData.contactPerson,
          this.contactData.companyAddress,
          this.contactData.companyEmail
        ];
        if (!requiredFields.every(field => field !== '' && field !== null && field !== undefined)) {
          this.isSubmitting = false;
          return;
        }
        templateParams = {
          formType: 'Company',
          email: this.contactData.companyEmail || '',
          reply_to: this.contactData.companyEmail || ''
        };
      } else if (this.contactData.formType === 'personal') {
        const requiredFields = [
          this.contactData.fullName,
          this.contactData.occupation,
          this.contactData.storageNeeded,
          this.contactData.personalAddress,
          this.contactData.personalPhone,
          this.contactData.personalEmail
        ];
        if (!requiredFields.every(field => field !== '' && field !== null && field !== undefined)) {
          this.isSubmitting = false;
          return;
        }
        templateParams = {
          formType: 'Personal',
          email: this.contactData.personalEmail || '',
          reply_to: this.contactData.personalEmail || ''
        };
      } else {
        this.isSubmitting = false;
        return;
      }

      // Send email to admin
      await emailjs.send('service_f5r9z8d', 'template_3a36wjg', templateParams);
      this.closeContactForm();
    } catch (error: any) {
      // Handle error silently
    } finally {
      this.isSubmitting = false;
    }
  }

  disableRightClick(event: MouseEvent): void {
    event.preventDefault();
  }

  disableDevTools(event: KeyboardEvent): void {
    // Block F12
    if (event.key === 'F12') {
      event.preventDefault();
      return;
    }

    // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'i' || event.key === 'J' || event.key === 'j')) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && (event.key === 'U' || event.key === 'u')) {
      event.preventDefault();
      return;
    }
  }

  // Clean up event listener when component is destroyed
  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.disableDevTools.bind(this));
  }
}