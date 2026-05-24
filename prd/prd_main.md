# Conexo - Product Requirements Document

> **Last Updated**: 2026-05-23
> **Version**: 1.8
> **Status**: Active Development

---

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Authentication | ✅ Implemented | Google OAuth + JWT, redirect-after-login |
| Move Management | ✅ Implemented | Full CRUD with all fields |
| Video Management | ✅ Implemented | Upload dialog with trim, rename, drag-and-drop, playback, delete |
| Move Connections | ✅ Implemented | Directional relationships with labels |
| Collections | ✅ Implemented | Frontend + Backend, graph view, default collections |
| Sequences | ✅ Implemented | Backend API complete with connection validation |
| Themes | ✅ Implemented | Full CRUD, move grouping by theme |
| Graph Visualization | ✅ Implemented | Multiple layouts (Focus, Dagre, Force, ELK, Ring, Core, Custom), connection highlighting, Core explore |
| Collection Navigation | ✅ Implemented | Segment control (List / Flow / Graph / Learn / Tag); Flow is the default view |
| Tag Selection (Flow) | ✅ Implemented | Activate a tag to see its moves as a left-to-right flow with L0–LX neighbors, green highlighting, tag-aware previews |
| Media Tags | ✅ Implemented | One media item per tag per move; Flow preview prefers the tag's media |

**Legend**: ✅ Implemented | 🚧 In Progress | 🔲 Not Started

---

## 1. Product Overview

### 1.1 Product Name
**Conexo** (Spanish for "connection")

### 1.2 Purpose
A web application for organizing, cataloging, and connecting dance moves. Conexo helps dancers visualize how moves flow into each other, track their learning progress, and build a personal library of dance techniques.

### 1.3 Target Users
- Dance instructors organizing teaching materials
- Dance students tracking their learning journey
- Social dancers cataloging moves by style and difficulty
- Choreographers planning routines and sequences

### 1.4 Core Value Proposition
- **Organize**: Catalog moves with detailed metadata (timing, difficulty, energy levels)
- **Connect**: Define relationships between moves to understand transitions
- **Reference**: Attach videos for visual reminders
- **Filter**: Quickly find moves by style, difficulty, familiarity, or characteristics

---

## 2. Core Features

### 2.1 Authentication
- **Method**: Google OAuth 2.0 (Sign in with Google)
- **User Data**: Email, name, profile picture from Google account
- **Session**: JWT-based authentication for API requests
- **Scope**: All data is user-scoped (private to each user)
- **Redirect-after-login**: When a user's session expires (401), the current URL is preserved. After re-login, the user is redirected back to where they were.

### 2.2 Move Management
Full CRUD operations for dance moves with rich metadata:
- Create, read, update, delete moves
- Filter and search functionality
- Two move types: regular moves and states (positions/momentum)

### 2.3 Video Management
- Upload videos to moves via drag-and-drop zone or file picker
- Upload dialog with video preview, filename editing, and optional trim (FFmpeg.wasm, stream copy)
- Video playback directly in the app
- Inline video rename after upload
- Multiple videos per move supported
- Google Cloud Storage for video hosting
- 0-byte file detection for macOS Photos drag failures

### 2.4 Move Connections
- Define directional relationships between moves
- Track which moves lead into/out of other moves
- Label transitions with descriptive text
- Visualize move flow patterns

### 2.5 Collections ✅
- Group moves into named, unordered sets
- Scoped to a single dance style (immutable after creation)
- Use cases: tracking class curriculum, practice sets, move pools
- Same move can belong to multiple Collections
- **Default Collections**: Auto-created "All [Style] Moves" collections per dance style
- **Graph View**: Default view when opening a collection (`/collections/:id` redirects to `/collections/:id/graph`)
- **List View**: Accessible at `/collections/:id/moves`
- **Position Persistence**: Custom node positions saved per collection
- **Batch Loading**: Single `graph-data` endpoint bundles collection, moves, and connections for optimized graph loading

### 2.6 Sequences ✅
- Ordered choreography of moves
- Scoped to a single dance style (immutable after creation)
- Supports custom entries (breaks, flourishes) that aren't in the move library
- Adjacent moves must have valid Connections (except for custom entries)
- Use cases: performance routines, class demos, choreography planning

### 2.7 Themes ✅
- Group moves into named thematic categories within a dance style
- Scoped to a single dance style (immutable after creation)
- Use cases: organizing moves by concept (e.g., "Body Rolls", "Turn Patterns", "Dips")
- Same move can belong to multiple Themes
- Unique theme names per user per dance style
- Theme associations viewable and editable from the graph Edit Move panel

---

## 3. Data Model

### 3.1 User Entity

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| email | string(255) | unique, required | User's email from Google |
| name | string(255) | required | Display name from Google |
| picture_url | string(500) | optional | Profile picture URL |
| google_id | string(255) | unique, required | Google account ID |
| created_at | timestamp | auto | Account creation time |

### 3.2 Move Entity

#### Core Fields
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → users, required | Owner of the move |
| name | string(255) | required | Move name |
| description | text | optional | Detailed description |
| dance_style | string(100) | required, enum | Dance style category |
| tags | string[] | default: [] | Freeform tags |
| created_at | timestamp | auto | Creation time |
| updated_at | timestamp | auto | Last modification |

#### Timing Fields
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| beat_count | integer | ≥0, conditional | Number of beats (0 for states) |
| starting_beat | integer | 1-8, required | Which beat the move starts on |
| is_state | boolean | default: false | True = position/momentum (not a move) |

**Timing Rules**:
- `starting_beat` is always required (1-8) for both moves and states
- If `is_state = true`: `beat_count` must be 0
- If `is_state = false`: `beat_count` must be ≥1

#### Assessment Fields (Required)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| difficulty | integer | 1-10, required | How hard to execute |
| familiarity | integer | 1-10, required | How well user knows it |

#### Assessment Fields (Optional)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| leadability | integer | 1-10, optional | How easy to lead |
| mental_availability | integer | 0-10, optional | Mental effort required |
| learning_priority | integer | 0-10, optional | Current desire to improve learning of this move |
| impact | integer | 0-10, optional | Visual/audience impact of the move |
| beat_energy | integer | 0-10, optional | Energy/intensity level |
| sensual_energy | integer | 0-10, optional | Sensuality/connection level |

#### Key Move Flags
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| key_egress | boolean | false | Many moves can follow this one |
| key_ingress | boolean | false | Many moves can lead to this one |
| is_core | boolean | false | Core move (used in Core graph view and Ring layout) |

#### Notes
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| leader_styling | string(300) | optional | Notes on leader's styling |
| follower_styling | string(300) | optional | Notes on follower's styling |
| learning_notes | text | optional | Issues to work out or ask a teacher about |

### 3.3 Video Entity

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| move_id | UUID | FK → moves, cascade delete | Associated move |
| user_id | UUID | FK → users | Owner |
| gcs_key | string(500) | required | Google Cloud Storage path |
| filename | string(255) | required | Original filename |
| content_type | string(100) | required | MIME type (video/*) |
| size_bytes | bigint | required | File size |
| created_at | timestamp | auto | Upload time |

### 3.3a Media Tag Entity (`media_tags` join table)

Associates a collection tag with a single media item, scoped per move. Used so
the Flow tag view can show a move's tag-specific media as its preview.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| tag_id | UUID | FK → tags, cascade delete | Collection tag |
| media_id | UUID | FK → move_videos, cascade delete | Media item |
| move_id | UUID | FK → moves, cascade delete | Denormalized owner move |

**Media Tag Rules**:
- Unique constraint: `(tag_id, move_id)` — at most one media item per tag per
  move ("one media per tag per move").
- Re-assign on conflict: attaching a tag already on another media item of the
  same move silently moves it to the new media item.
- The tag must belong to a collection that the media's move is part of.

### 3.4 Connection Entity

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → users | Owner |
| source_move_id | UUID | FK → moves, cascade | Move that leads out |
| target_move_id | UUID | FK → moves, cascade | Move that follows |
| label | string(255) | optional | Transition description |
| notes | text | optional | Additional details |
| created_at | timestamp | auto | Creation time |

**Connection Rules**:
- Unique constraint: One connection per (user, source, target) triple
- No self-connections: source_move_id ≠ target_move_id

### 3.5 Collection Entity ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → users | Owner |
| name | string(255) | required | Collection name |
| description | text | optional | Collection description |
| dance_style | string(100) | required, immutable | Dance style (set at creation, cannot change) |
| is_default | boolean | default: false | Whether this is an auto-created default collection |
| date_last_opened | timestamp | optional | Last time collection was viewed |
| created_at | timestamp | auto | Creation time |
| updated_at | timestamp | auto | Last modification |

### 3.6 CollectionMove Entity (Join Table) ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| collection_id | UUID | FK → collections, cascade | Parent collection |
| move_id | UUID | FK → moves, cascade | Referenced move |
| notes | text | optional | Context for this move in this collection |
| position_x | float | optional | X coordinate in graph view |
| position_y | float | optional | Y coordinate in graph view |
| added_at | timestamp | auto | When move was added |

**CollectionMove Rules**:
- Unique constraint: One entry per (collection_id, move_id) pair
- Move's dance_style must match Collection's dance_style
- Position fields used for Custom layout persistence in graph view

### 3.7 Sequence Entity ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → users | Owner |
| name | string(255) | required | Sequence name |
| description | text | optional | Sequence description |
| dance_style | string(100) | required, immutable | Dance style (set at creation, cannot change) |
| created_at | timestamp | auto | Creation time |
| updated_at | timestamp | auto | Last modification |

### 3.8 SequenceMove Entity (Join Table) ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| sequence_id | UUID | FK → sequences, cascade | Parent sequence |
| position | integer | required | Order in sequence (1-indexed) |
| move_id | UUID | FK → moves, nullable | Referenced move (null for custom entries) |
| custom_name | string(255) | nullable | Name for custom entry (breaks, flourishes) |
| custom_beat_count | integer | nullable | Beat count for custom entry |
| notes | text | optional | Notes for this entry |

**SequenceMove Rules**:
- Unique constraint: One entry per (sequence_id, position) pair
- Either `move_id` OR `custom_name` must be set (not both, not neither)
- If `move_id` is null, `custom_beat_count` is required
- If `move_id` is set, move's dance_style must match Sequence's dance_style
- Adjacent entries with `move_id` must have a valid Connection between them

**Custom Entry Upgrade Flow**:
- Custom entries can be upgraded to real Moves
- Process: Create Move → Create Connections → Set move_id, clear custom fields

### 3.9 Theme Entity ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Unique identifier |
| user_id | UUID | FK → users | Owner |
| name | string(100) | required | Theme name |
| dance_style | string(100) | required, immutable | Dance style (set at creation, cannot change) |
| description | text | optional | Theme description |
| created_at | timestamp | auto | Creation time |
| updated_at | timestamp | auto | Last modification |

### 3.10 ThemeMove Entity (Join Table) ✅

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| theme_id | UUID | FK → themes, cascade | Parent theme |
| move_id | UUID | FK → moves, cascade | Referenced move |
| added_at | timestamp | auto | When move was added |

**Theme Rules**:
- Unique constraint: One entry per (theme_id, move_id) pair
- Unique constraint: One theme per (user_id, dance_style, name) triple
- Move's dance_style must match Theme's dance_style

---

## 4. Dance Styles

Currently supported dance styles (enum):
1. **Salsa** - Cuban/LA style salsa
2. **Bachata** - Dominican bachata
3. **Zouk** - Brazilian zouk
4. **Kizomba** - Angolan kizomba
5. **West Coast Swing** - WCS
6. **Lambada** - Brazilian lambada
7. **Yoga** - Yoga poses and flows (no default collection)

---

## 5. UI Pages

### 5.1 Login Page (`/login`)
- Google Sign-In button
- Redirects to previous page on successful login (reads from `location.state.from` or `?redirect=` query param, defaults to `/`)
- Public route (no auth required)

### 5.2 Moves List Page (`/`)
- Display all user's moves in card format
- **Search**: Filter by name (case-insensitive)
- **Filters**:
  - Dance style dropdown
  - Type filter (All / Moves only / States only)
  - Max difficulty slider
  - Min familiarity slider
- Move count display
- "Add Move" button
- Empty state when no moves exist
- Protected route (requires auth)

### 5.3 Move Form Page (`/moves/new`, `/moves/:id/edit`)
- **Sections**:
  1. Core Identity: Name*, Description, Dance Style*
  2. Timing: Is State checkbox, Starting Beat*, Beat Count*
  3. Assessment: Difficulty*, Familiarity*, optional scores with clear buttons
  4. Key Move Flags: Key Egress, Key Ingress checkboxes
  5. Notes: Leader Styling, Follower Styling textarea (300 char limit with counter), Learning Notes
  6. Tags: Add/remove freeform tags
- Dynamic field visibility based on is_state toggle
- Save and Cancel buttons
- Protected route

### 5.4 Move Detail Page (`/moves/:id`)
- **Sections**:
  1. Header: Name, dance style, edit/delete buttons
  2. Description (if present)
  3. Stats: Beat info, difficulty, familiarity
  4. Secondary stats: Optional scores (only shown if set)
  5. Key move badges (if flagged)
  6. Tags (if present), grouped per collection. Each tag name is a link to that
     collection's Flow view with the tag active (`/collections/:id/flow?tag=`).
  7. Leader styling (if present)
  8. Follower styling (if present)
  9. Learning notes (if present)
  10. Videos section: Upload, playback, delete
  11. Connections section: Incoming/outgoing with add/delete
- Protected route

### 5.5 Collections List Page (`/collections`)
- Display all user's collections in card format
- **Collection Card Info**:
  - Name
  - Dance style badge
  - Move count
  - Description (truncated)
- "Create Collection" button
- Empty state when no collections exist
- Protected route

### 5.6 Collection Views & Segment Control

All collection-scoped pages share a **segment control** (tab bar) shown beneath
the collection name, replacing the old per-page back links and action buttons.
Each view renders its own toolbar below the tab bar when needed.

| Tab | Route | View |
|-----|-------|------|
| List | `/collections/:id/moves` | Moves list (5.6a) |
| Flow | `/collections/:id/flow` | Focus-only graph (Section 9) |
| Graph | `/collections/:id/graph` | All other graph layouts — deprecated (Section 9) |
| Learn | `/collections/:id/learn` | Learning activities |
| Tag | `/collections/:id/tags` | Tag manager |

- `/collections/:id` redirects to **Flow** (the default view).
- Collection name is shown inline with the segment control; back navigation to
  the all-collections list is via the global app header (no per-page back link).

#### 5.6a List View (`/collections/:id/moves`)
- **Toolbar**: dance style, description, Add Move, Edit, Delete
- **Moves List**: All moves in collection with cards
- **Move Actions**: Remove from collection
- **Add Moves**: Search and add existing moves of same dance style
- Protected route

### 5.7 Collection Flow / Graph Pages (`/collections/:id/flow`, `/collections/:id/graph`)
- **Flow** is the default view (`/collections/:id` redirects to `/flow`); it
  renders the Focus layout only (no layout selector). **Graph** keeps the other
  layouts (Dagre, Force, ELK, Ring, Core, Custom) and is deprecated.
- **Toolbar** (below the segment control): layout selector (Graph only), move/tag
  search, filter, advanced search, plus Focus level/sort/preview controls.
- **Graph Canvas**: Interactive React Flow visualization
- **Controls**: Zoom, pan, fit view, mini-map
- **Panels**: Move detail panel (slide-in, shows cover media above Timing),
  Edit Move panel (slide-in), Add connection panel (slide-in)
- **Node Features**:
  - Timing tag: red pill badge showing beat range (e.g., "5-8") or single beat for states (e.g., "4")
  - Selected nodes display full untruncated title
  - Connection status indicators (entry point, dead end, isolated) drawn as
    overlay edge bars so they remain visible on tagged (highlighted) nodes
- **Search**: Searchable dropdown over moves and tags (Flow), keyboard navigation
  (arrow keys, Enter, Escape), results sorted by last-updated, clickable "more..."
  pagination (loads 20 more per click)
- **Edit Move Panel**: Opens from node context; follows node selection changes
  (switching nodes auto-updates the panel). Includes tag and media management.
- See Section 9 for full Graph Visualization documentation, including Tag
  selection (9.3)
- Protected route

### 5.8 Themes List Page (`/themes`)
- Display all user's themes in card format
- **Theme Card Info**: Name, dance style, move count, description (truncated)
- Filter by dance style dropdown
- Create new theme with inline form (name, dance style, description)
- Protected route

### 5.9 Theme Detail Page (`/themes/:id`)
- **Header**: Theme name, dance style, edit/delete controls
- **Edit mode**: Toggle to edit name and description
- **Moves list**: Shows move name, date added, remove button
- **Add moves**: Dropdown filtered to same dance style, excludes already-added moves
- Protected route

### 5.10 Sequences List Page (`/sequences`)
- Display all user's sequences in card format
- Protected route

### 5.11 Sequence Detail Page (`/sequences/:id`)
- Ordered list of moves with position management
- Custom entry support (breaks, flourishes)
- Protected route

---

## 6. API Endpoints

### 6.1 Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google` | Exchange Google token for JWT |
| GET | `/api/auth/me` | Get current user profile |

### 6.2 Moves
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/moves` | List moves (with query filters) |
| POST | `/api/moves` | Create new move |
| GET | `/api/moves/{id}` | Get move details |
| PUT | `/api/moves/{id}` | Update move |
| DELETE | `/api/moves/{id}` | Delete move (cascades) |

**List Query Parameters**:
- `difficulty_min`, `difficulty_max` (1-10)
- `familiarity_min`, `familiarity_max` (1-10)
- `dance_style` (string)
- `tag` (string, matches any tag)
- `is_state` (boolean)
- `key_egress` (boolean)
- `key_ingress` (boolean)

### 6.3 Media (Videos/Images)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/moves/{id}/media` | Upload media |
| GET | `/api/moves/{id}/media` | List move's media |
| GET | `/api/media/{id}/url` | Get playable URL |
| PATCH | `/api/media/{id}` | Rename media |
| PATCH | `/api/moves/{id}/cover-media/{mediaId}` | Set cover media |
| DELETE | `/api/media/{id}` | Delete media |
| GET | `/api/media/{id}/tags` | List tags attached to a media item |
| POST | `/api/media/{id}/tags` | Attach a tag (re-assigns within the move); returns the media's tags |
| DELETE | `/api/media/{id}/tags/{tagId}` | Detach a tag from a media item |

### 6.4 Connections
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/connections` | List all user's connections |
| POST | `/api/connections` | Create connection |
| PUT | `/api/connections/{id}` | Update connection |
| DELETE | `/api/connections/{id}` | Delete connection |
| GET | `/api/connections/by-move/{id}` | Get connections for a move |

### 6.5 Collections ✅
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/collections` | List all user's collections (with move_count) |
| POST | `/api/collections` | Create collection |
| GET | `/api/collections/{id}` | Get collection with moves (includes position data) |
| GET | `/api/collections/{id}/graph-data` | Batch endpoint: collection + full moves + connections + tags + media_tags |
| PUT | `/api/collections/{id}` | Update collection (name, description only) |
| DELETE | `/api/collections/{id}` | Delete collection |
| POST | `/api/collections/{id}/moves` | Add move to collection |
| DELETE | `/api/collections/{id}/moves/{move_id}` | Remove move from collection |
| PATCH | `/api/collections/{id}/moves/{move_id}/position` | Update move position in graph |
| POST | `/api/collections/ensure-defaults` | Create missing default collections |
| POST | `/api/collections/sync-defaults` | Sync default collections with all moves of their style |

**Default Collections**:
- Auto-created "All [Style] Moves" collection for each dance style when user creates moves
- Marked with `is_default: true` flag
- Cannot be deleted, renamed, or have moves manually added/removed
- Automatically includes all moves of that dance style

### 6.6 Sequences ✅
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sequences` | List all user's sequences |
| POST | `/api/sequences` | Create sequence |
| GET | `/api/sequences/{id}` | Get sequence with entries |
| PUT | `/api/sequences/{id}` | Update sequence (name, description only) |
| DELETE | `/api/sequences/{id}` | Delete sequence |
| POST | `/api/sequences/{id}/entries` | Add entry to sequence |
| PUT | `/api/sequences/{id}/entries/{entry_id}` | Update entry (position, notes) |
| DELETE | `/api/sequences/{id}/entries/{entry_id}` | Remove entry from sequence |
| POST | `/api/sequences/{id}/entries/{entry_id}/upgrade` | Upgrade custom entry to Move |

### 6.7 Themes ✅
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/themes` | List all user's themes (optional dance_style filter) |
| POST | `/api/themes` | Create theme |
| GET | `/api/themes/{id}` | Get theme with moves |
| PATCH | `/api/themes/{id}` | Update theme (name, description only) |
| DELETE | `/api/themes/{id}` | Delete theme |
| POST | `/api/themes/{id}/moves` | Add move to theme |
| DELETE | `/api/themes/{id}/moves/{move_id}` | Remove move from theme |
| GET | `/api/themes/by-move/{move_id}` | Get all themes containing a move |

### 6.8 Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

---

## 7. Technical Stack

### 7.1 Backend
- **Framework**: FastAPI (Python 3.12)
- **Database**: PostgreSQL 16
- **ORM**: SQLAlchemy 2.0 (async)
- **Migrations**: Alembic
- **Storage**: Google Cloud Storage
- **Auth**: Google OAuth 2.0 + JWT

### 7.2 Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Routing**: React Router
- **HTTP Client**: Axios
- **Auth**: @react-oauth/google
- **Graph**: React Flow (@xyflow/react), D3-Force, elkjs, @dagrejs/dagre

### 7.3 Infrastructure
- PostgreSQL via Docker Compose
- Backend on port 8888
- Frontend on port 5173
- CORS configured for local development

---

## 8. Validation Rules Summary

### 8.1 Move Validation
| Rule | Condition |
|------|-----------|
| Starting beat | 1-8 (required for all moves and states) |
| State timing | is_state=true → beat_count=0 |
| Move timing | is_state=false → beat_count≥1 |
| Difficulty | 1-10 (required) |
| Familiarity | 1-10 (required) |
| Leadability | 1-10 when set |
| Other scores | 0-10 when set |
| Name | Required, max 255 chars |
| Dance style | Required, must be valid enum |
| Leader styling | Max 300 chars |
| Follower styling | Max 300 chars |

### 8.2 Connection Validation
| Rule | Description |
|------|-------------|
| Uniqueness | One connection per (user, source, target) |
| No self-loop | source_move_id ≠ target_move_id |
| Ownership | Both moves must belong to user |

### 8.3 Collection Validation ✅
| Rule | Description |
|------|-------------|
| Dance style immutable | Cannot change after creation |
| Move style match | Added moves must have same dance_style as collection |
| Unique membership | Move can only be in a collection once |

### 8.4 Sequence Validation ✅
| Rule | Description |
|------|-------------|
| Dance style immutable | Cannot change after creation |
| Move style match | Added moves must have same dance_style as sequence |
| Position unique | Each position in sequence must be unique |
| Entry type | Must have move_id OR (custom_name AND custom_beat_count) |
| Connection required | Adjacent move entries must have valid Connection |
| Connection skip | Custom entries don't require Connections to/from them |

### 8.5 Theme Validation ✅
| Rule | Description |
|------|-------------|
| Dance style immutable | Cannot change after creation |
| Move style match | Added moves must have same dance_style as theme |
| Unique membership | Move can only be in a theme once |
| Unique name | Theme name must be unique per user per dance style |

---

## 9. Graph Visualization ✅

### 9.1 Collection Graph View (`/collections/:id/graph`)
Interactive node-link diagram for visualizing move connections within a collection.

#### Layout Options
| Layout | Engine | Best For |
|--------|--------|----------|
| **Focus** (default) | Custom | Centered node with predecessors/successors |
| **Dagre** | @dagrejs/dagre | Hierarchical flow, simple graphs |
| **Force** | D3-Force | Organic "web" view, cyclic graphs, clusters |
| **ELK Layered** | elkjs | Hierarchical with proper cycle handling |
| **ELK Stress** | elkjs | Organic layout (deterministic) |
| **Ring** | Custom | States in a ring, Movements radiating outward in subgraphs |
| **Core** | D3-Force | Core moves only, distance reflects path length through intermediaries |
| **Custom** | Manual | User-positioned nodes (persisted) |

#### Node Display
- **Move Nodes**: Standard dance moves (red accent)
- **State Nodes**: Positions/momentum (gray accent)
- **Timing Tag**: Red pill badge showing beat range (e.g., "5-8") or single beat for states (e.g., "4")
- **Selected Nodes**: Full untruncated title displayed

#### Node Connection Indicators
Drawn as overlay edge bars (not borders) so they remain visible on tagged
(green-highlighted) and focused nodes:
- **Entry Point** (green left bar): No incoming connections
- **Dead End** (orange right bar): No outgoing connections
- **Isolated** (red left + right bars): No connections at all

#### Disconnected Subgraph Detection
- Union-Find algorithm analyzes graph connectivity
- Warning badge shows count of disconnected groups
- Click badge to highlight groups with different colors

#### Focus Mode Features
- **Default layout** (the **Flow** view) when opening a collection
- **Auto-select**: Randomly selects a node if none is focused
- **Straight top row**: The focused move and every column's top move align to a
  single row; nodes stack downward within each column (predecessors on the left,
  successors on the right)
- **Level control**: L0–L5. L0 shows only the focused move (no neighbors); each
  level adds one more hop of predecessors/successors
- Sort connected moves by: difficulty, familiarity, mental_availability, beat_energy, sensual_energy, date added, has learning notes
- Ascending/descending toggle
- Preview toggle: show cover media above column-top / focused nodes (capped at
  360px; videos seek to `#t=0.1` so a real frame shows instead of black)
- Click any node to re-focus on it
- Info icon on hover for move details

#### Ring Layout Features
- States (`is_state=true`) arranged in a circle at the center
- Movements radiate outward in subgraphs per connected State (BFS, full reachability)
- Movements reachable from multiple States are duplicated (virtual nodes)
- Edges from subgraph Movements to other States draw back to the ring
- Orphan Movements (no path to any State) clustered separately below the ring

#### Core Layout Features
- Shows only `is_core=true` moves
- Edge weight = shortest acyclic path length through non-Core intermediaries
- D3 force simulation: link distance proportional to path weight
- Straight edges (no elbows), no edge labels — spatial distance conveys relatedness
- **Core Explore subview**: Magnifying glass icon on each Core node; click to see all reachable moves from that Core move, stopping at other Core moves (which become leaf nodes). Dagre hierarchical layout (LR). Back button (glass-morphism circle, SVG chevron) returns to full Core overview.
- Core Explore subview: "+" button on non-leaf nodes for adding connections; leaf Core nodes have no "+" button
- In Core view, clicking a node highlights incoming (blue #4A9EFF) and outgoing (orange #FF8C42) edges; detail panel opens only via the info "i" button

#### Connection Highlighting (all layouts)
- **Outgoing edges**: Orange (#FF8C42), 2.5px stroke
- **Incoming edges**: Blue (#4A9EFF), 2.5px stroke
- **Unrelated edges**: Dimmed to 50% opacity
- **Directly selected edge**: Keeps existing red-pink animated style
- **Background click**: Deselects node, clears all edge highlighting

#### Search and Navigation
- **Keyboard navigation**: Arrow keys to navigate dropdown results, Enter to select, Escape to close
- **Paginated results**: Clickable "more..." loads 20 additional results per click
- **Edit Move panel**: Follows node selection (switching nodes auto-updates the editing panel)

#### Add Connection Panel
- **Direction Control**: Connect To (outgoing) or Connect From (incoming)
- **Searchable Move Dropdown**: Search ALL user moves of same dance style
- **Add to Collection Badge**: Indicator for moves not in current collection
- **New Move Creation**: Inline form to create new move and add connection
- **Connection Labels**: Optional label for the transition

### 9.3 Tag Selection (Flow view)
Selecting a tag turns the Flow view into a focused sub-graph of that tag.
- **Activation**: Pick a tag from the move/tag search dropdown, click a tag name
  in a move detail panel/page, or load `?tag=<tagId>`. A removable chip (green)
  appears over the canvas; closing it returns to the regular Flow view focused
  on the selected node. State persists in the URL (`?tag=`).
- **Tagged-move layout**: All moves carrying the tag ("Level 0") are laid out
  left-to-right in flow order (topological); each tagged move's predecessors fan
  into the column to its left and successors to the column on its right.
  Non-tagged neighbors expand by the L0–LX level control. Every edge connects
  adjacent columns only (no arrows spanning the whole graph). A move appearing in
  more than one column is duplicated; non-tagged neighbors appear once.
- **Highlighting**: Tagged moves are filled/outlined green (`#22c55e`), matching
  the chip. Tag→tag flow edges are green; predecessor (incoming) edges blue;
  successor (outgoing) edges orange — applied to all tagged moves, not just the
  focused one.
- **Clicking a node** re-selects it as the focused node (the tag layout stays
  put; the view does not re-center on each click).
- **Search while a tag is active**: if the searched move is already shown, it
  becomes the focused node; if not, the tag view closes and the move is shown as
  the focused node in the normal Flow view.
- **Preview**: when a tag is active, each tagged move's preview prefers the media
  item marked with that tag (see Media Tags, 3.x / 6.x), falling back to cover.

### 9.2 Graph Technical Details
- **React Flow**: Node and edge rendering
- **Curved Edges**: Smart handle selection based on node positions
- **Edge Animation**: Selected edges show animated flow
- **Position Persistence**: Custom layout positions saved to backend
- **MiniMap**: Overview navigation
- **Batch Loading**: Single API call (`/graph-data`) fetches collection, moves, connections, tags, and media_tags (per-move tag→media links for tag-aware previews)

---

## 10. Future Enhancements

*Placeholder for planned features*

### 10.1 Sequence Enhancements
- Timeline view with beat counts
- Total duration calculation
- Drag-and-drop reordering
- Duplicate sequence functionality
- Export/share sequences

### 10.2 Collaboration
- Share moves with other users
- Public move library
- Community contributions

### 10.3 Analytics
- Practice tracking
- Progress over time
- Move statistics

### 10.4 Mobile App
- Native mobile experience
- Offline access
- Quick video capture

---

## Document Organization

As this PRD grows, content will be split into subdirectories:

```
prd/
├── prd_main.md         # This file (index and overview)
├── data/               # Data model specifications
│   ├── data_main.md
│   ├── moves.md
│   ├── videos.md
│   ├── connections.md
│   ├── collections.md
│   ├── sequences.md
│   └── themes.md
├── ui/                 # UI specifications
│   ├── ui_main.md
│   ├── moves_list.md
│   ├── move_form.md
│   ├── move_detail.md
│   ├── collections.md
│   ├── sequences.md
│   ├── themes.md
│   └── graph_view.md
└── auth/               # Authentication specifications
    └── authentication.md
```

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-05-23 | 1.8 | Added collection segment-control navigation (List/Flow/Graph/Learn/Tag) with Flow as the default view (5.6, 5.7). Added Tag Selection in the Flow view: tag chip, move/tag search, left-to-right tagged-move flow, green highlighting, L0–LX level control, tag-aware previews (9.3, 9.1). Added Media Tags: media_tags join table (3.3a), GET/POST/DELETE /media/{id}/tags, graph-data now returns tags + media_tags (6.3, 6.5, 9.2). Clickable tags in move detail (5.4). Cover media shown in graph detail panel. Connection-status indicators redrawn as overlay bars; focus layout uses a single straight top row; preview height capped and videos seek to #t=0.1 for a poster frame (9.1). Migration: media_tags table. |
| 2026-03-19 | 1.7 | Added is_core field to Key Move Flags (3.2). Added video upload dialog with trim, rename, drag-and-drop zone, 0-byte detection (2.3, 6.3). Added video rename endpoint PATCH /videos/{id} (6.3). Added Ring layout and Core layout with Core Explore subview (9.1). Added connection highlighting: blue incoming, orange outgoing, 50% dim unrelated (9.1). Added background click to deselect (9.1). Migration: is_core column + batch update for States. |
| 2026-03-13 | 1.6 | Added Themes feature (Section 2.7, 3.9-3.10, 5.8-5.9, 6.7, 8.5). Added Yoga dance style. Documented redirect-after-login (2.1, 5.1). Updated Collections: graph as default view, batch graph-data endpoint, list view route (2.5, 5.6, 5.7, 6.5). Updated Graph: Focus as default layout, auto-select, upside-down V pattern, timing tags, full title on selected nodes, keyboard navigation, paginated search, Edit Move panel follows selection (9.1). Added leader_styling to Move Notes (3.2). Added is_default/date_last_opened to Collection entity (3.5). Added graph libraries to tech stack (7.2). Added ensure-defaults/sync-defaults endpoints (6.5). |
| 2026-02-12 | 1.5 | Added Graph Visualization documentation (Section 9): layouts (Dagre, Force, ELK, Focus, Custom), connection indicators, disconnected subgraph detection, Add Connection panel. Updated Collections with frontend features, default collections, position persistence. Added UI pages 5.5-5.7 for collections and graph. |
| 2026-02-08 | 1.4 | Added learning_notes field to Move Notes section |
| 2026-02-07 | 1.3 | Made starting_beat required for both moves and states (was null for states) |
| 2026-02-07 | 1.2 | Implemented Collections and Sequences backend (models, schemas, routes, migration) |
| 2026-02-07 | 1.1 | Added Collection and Sequence entities with full data model, API endpoints, and validation rules. Added Implementation Status tracking. |
| 2026-02-07 | 1.0 | Initial PRD creation with all current features |
