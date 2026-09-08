import type { auth } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import { fieldErrors } from '../../../shared/api'
import { Button, Input, Textarea, UserAvatar } from '../../../shared/ui'
import { ImagePicker, type PickedImage } from '../../../shared/upload'
import {
  BIO_MAX_LENGTH,
  bioLength,
  bioProblem,
  displayNameProblem,
  linkProblem,
} from '../lib/profile-rules'
import { useEditProfile } from '../model/use-edit-profile'

type ProfileFormProps = {
  profile: auth.Me
}

/** Empty means "clear it", which the api spells as an explicit null. */
function orNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed.length === 0 ? null : trimmed
}

/**
 * AUTH-3's editable profile. Every rule checked here is the server's rule said
 * again, so somebody learns before they submit; the server is still what decides,
 * and whatever it says about a field is rendered on that field (T006).
 */
export function ProfileForm({ profile }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [link, setLink] = useState(profile.link ?? '')
  const [avatar, setAvatar] = useState<PickedImage | null>(null)

  const save = useEditProfile()

  const local = {
    displayName: displayNameProblem(displayName),
    bio: bioProblem(bio),
    link: linkProblem(link),
  }
  const fromServer = fieldErrors(save.error)
  const problem = (field: keyof typeof local): string | null =>
    local[field] ?? fromServer[field] ?? null
  const blocked = Object.values(local).some((value) => value !== null)

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (blocked) return

    save.mutate({
      displayName: displayName.trim(),
      bio: orNull(bio),
      link: orNull(link),
      ...(avatar === null ? {} : { avatarKey: avatar.key }),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label="Profile">
      <ImagePicker
        id="avatar"
        label="Avatar"
        purpose="avatar"
        preview={
          <UserAvatar
            user={{ displayName, avatarUrl: avatar?.previewUrl ?? profile.avatarUrl }}
            className="size-16"
          />
        }
        onPicked={setAvatar}
      />

      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor="displayName">
          Display name
        </label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          aria-invalid={problem('displayName') !== null}
          aria-describedby="displayName-problem"
        />
        <p id="displayName-problem" role={problem('displayName') === null ? undefined : 'alert'}>
          {problem('displayName') === null ? null : (
            <span className="text-destructive text-sm">{problem('displayName')}</span>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor="bio">
          Bio
        </label>
        <Textarea id="bio" value={bio} onChange={(event) => setBio(event.target.value)} rows={3} />
        <p className="text-muted-foreground text-xs" data-testid="bio-counter">
          {bioLength(bio)} / {BIO_MAX_LENGTH}
        </p>
        {problem('bio') === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {problem('bio')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor="link">
          Link
        </label>
        <Input
          id="link"
          value={link}
          placeholder="https://"
          onChange={(event) => setLink(event.target.value)}
          aria-invalid={problem('link') !== null}
        />
        {problem('link') === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {problem('link')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={blocked || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </Button>
        {save.isSuccess ? <span className="text-muted-foreground text-sm">Saved.</span> : null}
      </div>
    </form>
  )
}
