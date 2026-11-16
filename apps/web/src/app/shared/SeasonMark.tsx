/**
 * Season English brand mark: the four-season pinwheel chosen by the product owner
 * (spring green, summer yellow, autumn orange, winter blue, clockwise from top left).
 * Same mark in every season; only the icon spots use it, never the "Season English" text.
 */
export function SeasonMark({ className }: { className?: string }) {
  // media-scan: allow-brand -- product branding, not content artwork
  return <svg className={`season-mark season-mark--logo ${className ?? ""}`.trim()} data-testid="season-mark" viewBox="0 0 256 256" aria-hidden="true">
    <path fill="#69BC38" d="M123 122C97 126 73 105 72 79C71 53 94 32 121 29C138 27 146 36 146 48C146 67 133 73 122 85C108 100 109 111 123 122Z" />
    <path fill="#F9AB18" d="M129 121C128 102 137 85 152 72C166 60 177 62 186 48Q188 45 190 50C196 63 208 65 220 66C215 82 222 92 235 99C225 107 224 116 226 124C224 131 218 140 210 145C203 124 185 113 164 112C150 111 139 116 129 121Z" />
    <path fill="#F66932" d="M130 128C157 120 181 133 191 154C204 181 192 211 162 223C162 212 163 200 161 192C160 187 155 187 153 191C147 205 145 216 142 226C122 226 105 221 106 208C105 198 112 188 122 177C140 158 140 144 130 128Z" />
    <path fill="#398ADF" d="M125 129C126 151 113 173 91 182C75 190 60 191 45 187C45 179 48 172 51 167C37 165 27 159 20 153Q30 141 47 133C40 127 34 120 30 112C50 100 67 101 80 114C94 131 107 140 125 129Z" />
  </svg>;
}
