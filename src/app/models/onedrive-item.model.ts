export interface OneDriveItem {
  name: string;
  id: string;
  size: number;
  type: 'file' | 'folder';
  downloadUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  isHovered?: boolean;
  previewUrl?: string;
  previewDuration?: number;
  previewItems?: OneDriveItem[];
  previewError?: string;
}
