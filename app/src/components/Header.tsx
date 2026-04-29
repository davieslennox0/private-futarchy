import React from 'react';

export function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__logo">
          <div className="header__logo-icon">◈</div>
          Private Futarchy
        </div>
        <div className="header__pill">
          ZK · Devnet
        </div>
      </div>
    </header>
  );
}

