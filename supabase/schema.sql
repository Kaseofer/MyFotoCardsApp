-- MyFotoCards · base de datos en Supabase
-- Pegar entero en Supabase → SQL Editor → New query → Run.
--
-- Qué arma:
--   perfiles          nombre y foto de cada persona (se crea solo al registrarse)
--   proyectos         Hojas de fotos y colecciones de Luli's Photocards (el contenido va en JSON, igual que en el teléfono)
--   miembros          con quién se comparte cada proyecto y con qué rol (editor o lector)
--   enlaces           enlaces para compartir un proyecto
--   grupos            biblioteca de grupos y álbumes
--   fotos             cada foto subida, identificada por su huella (sha-256): la misma foto se sube una sola vez
--   proyecto_fotos    qué fotos usa cada proyecto (sirve para dar permiso de verlas a quien tiene el proyecto)
--   carpeta "fotos"   donde se guardan los archivos (privada: solo entra quien tiene permiso)
--
-- La seguridad está en la base: cada tabla tiene reglas (RLS) que dicen quién puede ver o cambiar cada fila,
-- por eso la app puede seguir siendo una página estática en GitHub Pages.

-- ---------- perfiles ----------
create table if not exists public.perfiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text,
  avatar_url text,
  creado timestamptz not null default now()
);

create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists al_registrarse on auth.users;
create trigger al_registrarse after insert on auth.users
  for each row execute procedure public.crear_perfil();

-- ---------- proyectos ----------
create table if not exists public.proyectos (
  id text primary key,                                   -- el mismo id que usa la app en el teléfono
  dueno uuid not null default auth.uid() references auth.users on delete cascade,
  modo text not null check (modo in ('hojas', 'cards')),
  nombre text not null default 'Sin nombre',
  grupo_id text,
  album_id text,
  datos jsonb not null,                                  -- el proyecto completo (lo mismo que la copia de seguridad)
  cantidad int not null default 0,                       -- fotos o tarjetas, para la lista
  version bigint not null default 1,                     -- sube en cada cambio: sirve para avisar si alguien lo cambió antes
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  borrado timestamptz                                    -- papelera: se borra de verdad más tarde
);
create index if not exists proyectos_dueno on public.proyectos (dueno);

-- ---------- miembros y enlaces ----------
create table if not exists public.miembros (
  proyecto_id text not null references public.proyectos on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  rol text not null check (rol in ('editor', 'lector')),
  agregado timestamptz not null default now(),
  primary key (proyecto_id, usuario_id)
);
create index if not exists miembros_usuario on public.miembros (usuario_id);

create table if not exists public.enlaces (
  token uuid primary key default gen_random_uuid(),
  proyecto_id text not null references public.proyectos on delete cascade,
  rol text not null default 'lector' check (rol in ('editor', 'lector')),
  creado_por uuid not null default auth.uid() references auth.users on delete cascade,
  vence timestamptz,
  creado timestamptz not null default now()
);

-- ---------- grupos ----------
create table if not exists public.grupos (
  id text primary key,
  dueno uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null,
  logo_hash text,                                        -- huella de la foto del logo
  albumes jsonb not null default '[]',                   -- [{id, nombre, logo_hash}]
  actualizado timestamptz not null default now()
);
create index if not exists grupos_dueno on public.grupos (dueno);

-- ---------- fotos ----------
create table if not exists public.fotos (
  dueno uuid not null default auth.uid() references auth.users on delete cascade,
  hash text not null,                                    -- sha-256 del archivo, en hexadecimal
  ruta text not null,                                    -- dentro de la carpeta "fotos": <dueno>/<hash>.jpg
  bytes int,
  ancho int,
  alto int,
  tipo text,
  creado timestamptz not null default now(),
  primary key (dueno, hash)
);
create unique index if not exists fotos_ruta on public.fotos (ruta);

create table if not exists public.proyecto_fotos (
  proyecto_id text not null references public.proyectos on delete cascade,
  dueno uuid not null,
  hash text not null,
  primary key (proyecto_id, dueno, hash),
  foreign key (dueno, hash) references public.fotos on delete cascade
);
create index if not exists proyecto_fotos_foto on public.proyecto_fotos (dueno, hash);

-- ---------- quién puede qué (funciones de ayuda) ----------
create or replace function public.puede_ver(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = pid and (
      p.dueno = auth.uid()
      or exists (select 1 from public.miembros m where m.proyecto_id = pid and m.usuario_id = auth.uid())
    )
  );
$$;

create or replace function public.puede_editar(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.proyectos p
    where p.id = pid and (
      p.dueno = auth.uid()
      or exists (select 1 from public.miembros m where m.proyecto_id = pid and m.usuario_id = auth.uid() and m.rol = 'editor')
    )
  );
$$;

create or replace function public.es_dueno(pid text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proyectos p where p.id = pid and p.dueno = auth.uid());
$$;

-- Cada cambio de un proyecto sube la versión; nadie puede cambiar el dueño
create or replace function public.antes_de_cambiar_proyecto() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.dueno <> old.dueno then raise exception 'No se puede cambiar el dueño de un proyecto'; end if;
  new.version := old.version + 1;
  new.actualizado := now();
  return new;
end; $$;
drop trigger if exists versionar on public.proyectos;
create trigger versionar before update on public.proyectos
  for each row execute procedure public.antes_de_cambiar_proyecto();

-- Abrir un enlace compartido: suma a quien lo abre como miembro y devuelve el proyecto
create or replace function public.aceptar_enlace(t uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare e public.enlaces;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  select * into e from public.enlaces where token = t and (vence is null or vence > now());
  if not found then raise exception 'El enlace no existe o venció'; end if;
  if exists (select 1 from public.proyectos where id = e.proyecto_id and dueno = auth.uid()) then return e.proyecto_id; end if;
  insert into public.miembros (proyecto_id, usuario_id, rol) values (e.proyecto_id, auth.uid(), e.rol)
  on conflict (proyecto_id, usuario_id) do update
    set rol = case when public.miembros.rol = 'editor' then 'editor' else excluded.rol end;
  return e.proyecto_id;
end; $$;

-- Borrar la cuenta (lo exige la App Store). Antes, la app borra los archivos con la API de Storage.
create or replace function public.borrar_mi_cuenta() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  delete from auth.users where id = auth.uid();
end; $$;

-- ---------- reglas (RLS) ----------
alter table public.perfiles enable row level security;
alter table public.proyectos enable row level security;
alter table public.miembros enable row level security;
alter table public.enlaces enable row level security;
alter table public.grupos enable row level security;
alter table public.fotos enable row level security;
alter table public.proyecto_fotos enable row level security;

-- perfiles: cada uno el suyo; también se ve el de quienes comparten un proyecto conmigo
create policy "perfil: ver" on public.perfiles for select to authenticated using (
  id = auth.uid()
  or exists (
    select 1 from public.miembros m
    where (m.usuario_id = perfiles.id and public.puede_ver(m.proyecto_id))
       or (m.usuario_id = auth.uid() and exists (select 1 from public.proyectos p where p.id = m.proyecto_id and p.dueno = perfiles.id))
  )
);
create policy "perfil: cambiar el propio" on public.perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- proyectos
create policy "proyecto: ver" on public.proyectos for select to authenticated using (public.puede_ver(id));
create policy "proyecto: crear" on public.proyectos for insert to authenticated with check (dueno = auth.uid());
create policy "proyecto: cambiar" on public.proyectos for update to authenticated using (public.puede_editar(id)) with check (public.puede_editar(id));
create policy "proyecto: borrar" on public.proyectos for delete to authenticated using (dueno = auth.uid());

-- miembros: el dueño los administra; cada miembro se ve a sí mismo y puede irse
create policy "miembro: ver" on public.miembros for select to authenticated using (usuario_id = auth.uid() or public.puede_ver(proyecto_id));
create policy "miembro: agregar" on public.miembros for insert to authenticated with check (public.es_dueno(proyecto_id));
create policy "miembro: cambiar rol" on public.miembros for update to authenticated using (public.es_dueno(proyecto_id)) with check (public.es_dueno(proyecto_id));
create policy "miembro: quitar o irse" on public.miembros for delete to authenticated using (public.es_dueno(proyecto_id) or usuario_id = auth.uid());

-- enlaces: solo el dueño del proyecto (abrirlos es con aceptar_enlace)
create policy "enlace: ver" on public.enlaces for select to authenticated using (public.es_dueno(proyecto_id));
create policy "enlace: crear" on public.enlaces for insert to authenticated with check (public.es_dueno(proyecto_id) and creado_por = auth.uid());
create policy "enlace: borrar" on public.enlaces for delete to authenticated using (public.es_dueno(proyecto_id));

-- grupos: cada uno los suyos
create policy "grupo: todo lo propio" on public.grupos for all to authenticated using (dueno = auth.uid()) with check (dueno = auth.uid());

-- fotos: las propias, y las de proyectos que puedo ver
create policy "foto: ver" on public.fotos for select to authenticated using (
  dueno = auth.uid()
  or exists (select 1 from public.proyecto_fotos pf where pf.dueno = fotos.dueno and pf.hash = fotos.hash and public.puede_ver(pf.proyecto_id))
);
create policy "foto: subir" on public.fotos for insert to authenticated with check (dueno = auth.uid() and ruta like auth.uid()::text || '/%');
create policy "foto: borrar" on public.fotos for delete to authenticated using (dueno = auth.uid());

create policy "proyecto_foto: ver" on public.proyecto_fotos for select to authenticated using (public.puede_ver(proyecto_id));
create policy "proyecto_foto: agregar" on public.proyecto_fotos for insert to authenticated with check (public.puede_editar(proyecto_id) and dueno = auth.uid());
create policy "proyecto_foto: quitar" on public.proyecto_fotos for delete to authenticated using (public.puede_editar(proyecto_id));

-- permisos de la API (solo para quien inició sesión)
revoke all on public.perfiles, public.proyectos, public.miembros, public.enlaces, public.grupos, public.fotos, public.proyecto_fotos from anon;
grant select, insert, update, delete on public.perfiles, public.proyectos, public.miembros, public.enlaces, public.grupos, public.fotos, public.proyecto_fotos to authenticated;
revoke execute on function public.aceptar_enlace(uuid), public.borrar_mi_cuenta() from anon, public;
grant execute on function public.aceptar_enlace(uuid), public.borrar_mi_cuenta(), public.puede_ver(text), public.puede_editar(text), public.es_dueno(text) to authenticated;

-- ---------- carpeta de fotos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 15728640, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- cada persona sube y borra solo en su carpeta (<su id>/...)
create policy "archivo: subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "archivo: reemplazar en mi carpeta" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "archivo: borrar de mi carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
-- ver: las propias, y las de proyectos compartidos conmigo
create policy "archivo: ver propios y compartidos" on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.fotos f
      join public.proyecto_fotos pf on pf.dueno = f.dueno and pf.hash = f.hash
      where f.ruta = storage.objects.name and public.puede_ver(pf.proyecto_id)
    )
  )
);
