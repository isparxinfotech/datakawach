import { Component } from '@angular/core';

@Component({
  selector: 'app-upload-to-cloud',
  templateUrl: './upload-to-cloud.component.html',
  styleUrls: ['./upload-to-cloud.component.css']
})
export class UploadToCloudComponent {
  username = '';
  files: File[] = [];
  result = '';
  loading = false;
  uploadProgress = 0;
  uploadDetails: { name: string; time: number; size: number }[] = [];

  handleConnect() {
    if (!this.username.trim()) {
      alert('Please enter a username.');
      return;
    }

    this.loading = true;
    this.result = '';

    fetch(`http://localhost:8080/api/s3/connect?username=${this.username}`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`${response.status} ${response.statusText}: ${errorData.message}`);
        }
        return response.json();
      })
      .then((data) => {
        this.result = JSON.stringify(data, null, 2);
      })
      .catch((error) => {
        this.result = `Failed to connect: ${error.message}`;
      })
      .finally(() => {
        this.loading = false;
      });
  }

  handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input?.files) {
      this.files = Array.from(input.files);
    }
  }

  handleFileUpload() {
    if (this.files.length === 0) {
      alert('Please select files to upload.');
      return;
    }

    if (!this.username.trim()) {
      alert('Please enter a username.');
      return;
    }

    this.loading = true;
    this.result = '';
    this.uploadProgress = 0;
    this.uploadDetails = [];

    const formData = new FormData();
    this.files.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('username', this.username);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:8080/api/s3/upload', true);

    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        this.uploadProgress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      }
    };

    xhr.onload = () => {
      this.loading = false;
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        this.uploadDetails = data.files.map((file: any) => ({
          name: file.name,
          size: file.size,
          time: file.uploadEndTime - file.uploadStartTime
        }));
        this.result = `Uploaded Files:\n${JSON.stringify(data, null, 2)}`;
      } else {
        this.result = `Failed to upload files: ${xhr.status} ${xhr.statusText}`;
      }
    };

    xhr.onerror = () => {
      this.loading = false;
      this.result = 'Failed to upload files: Network error';
    };

    xhr.send(formData);
  }
}
