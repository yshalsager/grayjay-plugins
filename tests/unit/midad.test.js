import { describe, expect, it } from 'vitest'
import { clean_midad_title, parse_inertia_page, pick_image, pick_playable_resource } from '../../src/plugins/midad/parsing.js'

describe('midad parsing helpers', () => {
  it('parses the embedded Inertia app payload', () => {
    const html = `
      <html>
        <script data-page="app" type="application/json">
          {&quot;component&quot;:&quot;Lesson/Show&quot;,&quot;props&quot;:{&quot;data&quot;:{&quot;lesson&quot;:{&quot;id&quot;:302084}}}}
        </script>
      </html>
    `

    expect(parse_inertia_page(html)).toMatchObject({
      component: 'Lesson/Show',
      props: { data: { lesson: { id: 302084 } } }
    })
    expect(parse_inertia_page('<html></html>')).toBeNull()
  })

  it('selects playable resources and thumbnails without using non-media resources', () => {
    const item = {
      image: { path: 'https://midad.com/fallback.jpg' },
      resources: [
        { type: 'document', path: 'https://midad.com/book.pdf' },
        { type: 'image', path: 'https://midad.com/thumb.jpg' },
        { type: 'audio', path: 'https://midad.com/audio.mp3' },
        { type: 'video', path: 'https://midad.com/video.mp4' }
      ]
    }

    expect(pick_playable_resource(item)).toEqual({ type: 'audio', path: 'https://midad.com/audio.mp3' })
    expect(pick_image(item)).toBe('https://midad.com/thumb.jpg')
  })

  it('cleans search highlights and HTML in titles', () => {
    expect(clean_midad_title('<em>التوحيد</em>&nbsp;الأول')).toBe('التوحيد الأول')
  })
})
