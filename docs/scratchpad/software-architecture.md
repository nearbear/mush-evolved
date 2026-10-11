# Software Architecture

# Game

## Server - PartyServer

- Edge servers are cheap if population is low because you only get charged for what you actually use
- Routing is handled by the edge servers for low latency
- Serves static Vite-built web bundle (includes wiki)

## Persistence & Auth - Supabase

- Avoids vender lock-in
- Postgres database for persistence of game and site data
- Authentication and authorization handled through Supabase's built-in features

## Frontend Framework - React

- The React Three Fiber package enables ThreeJs usage with React framework reactivity
- I know React well already so little learning will be required

## Game UI Engine - ThreeJS

Enables performant 2.5D graphics in a web application.  
Planned, but not immediate goal. I would need to get a functional engine first.

## API - TBD
