import React from 'react';

import '../styles/AccessibilityBanner.css';

interface AccessibilityBannerProps {
  onGrant: () => void;
}

export default function AccessibilityBanner({ onGrant }: AccessibilityBannerProps) {
  return (
    <div className="accessibility-banner" role="alert">
      <div className="accessibility-banner__content">
        <p className="accessibility-banner__message">
          ⌘C を2回押して QuickText を開く機能には、macOS の「アクセシビリティ」許可が必要です。
        </p>
        <p className="accessibility-banner__note">
          許可してもすぐ反応しない場合は、QuickText を再起動してください。
        </p>
      </div>
      <button type="button" className="accessibility-banner__button" onClick={onGrant}>
        許可する
      </button>
    </div>
  );
}
