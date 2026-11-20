// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react'
import { Info } from './Info'

export function PageHeader({ eyebrow, title, info, actions }: { eyebrow: string; title: string; info?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head rise">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <div className="title">
          <h1>{title}</h1>
          {info && <Info label={`About ${title}`}>{info}</Info>}
        </div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  )
}

export function SectionHead({ title, info, children, as: H = 'h2' }: { title: string; info?: ReactNode; children?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="section-head">
      <div className="title">
        <H>{title}</H>
        {info && <Info label={`About ${title}`}>{info}</Info>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  )
}
