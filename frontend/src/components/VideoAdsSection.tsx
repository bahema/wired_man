import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import VideoModal from './VideoModal';
import { VideoAd, publicApi } from '../services/publicApi';
import { useSubscribe } from '../context/SubscribeContext';
import { resolveMediaUrl } from '../data/mediaLibrary';

const fallbackVideos: VideoAd[] = [];

export default function VideoAdsSection() {
  const { open, completedIntent, clearCompletedIntent } = useSubscribe();
  const [videos, setVideos] = useState<VideoAd[]>(fallbackVideos);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<VideoAd | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    publicApi
      .fetchVideos()
      .then((data) => {
        if (mounted) setVideos(data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const sorted = useMemo(
    () => [...videos].sort((a, b) => a.sortOrder - b.sortOrder),
    [videos]
  );

  useEffect(() => {
    if (completedIntent?.type === 'video' && completedIntent.video) {
      setSelected({
        id: completedIntent.video.id,
        title: completedIntent.video.title,
        src: completedIntent.video.src,
        poster: completedIntent.video.poster || null,
        description: '',
        isNew: false,
        sortOrder: 0
      });
      clearCompletedIntent();
    }
  }, [completedIntent, clearCompletedIntent]);

  return (
    <>
      <div className="space-y-6">
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading videos...</Card>
        ) : null}
        <div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
              Video Ads
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Short promos with the key points before you subscribe.
            </p>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((video, index) => {
              const resolvedSrc = resolveMediaUrl(video.src);
              const resolvedPoster = resolveMediaUrl(video.poster || '');
              return (
                <Card key={video.id} className="overflow-hidden">
                  <div className="relative p-3">
                    <div
                      className="w-full overflow-hidden rounded-2xl bg-slate-100"
                      style={{ aspectRatio: aspectRatios[video.id] || 16 / 9 }}
                    >
                      <video
                        ref={(el) => {
                          videoRefs.current[index] = el;
                        }}
                        src={resolvedSrc}
                        poster={resolvedPoster || undefined}
                        preload="metadata"
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        onLoadedMetadata={(event) => {
                          const target = event.currentTarget;
                          if (target.videoWidth && target.videoHeight) {
                            const ratio = target.videoWidth / target.videoHeight;
                            setAspectRatios((prev) => ({
                              ...prev,
                              [video.id]: ratio
                            }));
                          }
                        }}
                      />
                    </div>
                    {video.isNew ? (
                      <span className="absolute bottom-5 right-5 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                        NEW
                      </span>
                    ) : null}
                    <div className="absolute right-5 top-5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          open({
                            type: 'video',
                            video: {
                              id: video.id,
                              title: video.title,
                              src: resolvedSrc,
                              poster: resolvedPoster || null
                            },
                            source: 'videos'
                          })
                        }
                      >
                        Play
                      </Button>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {video.title}
                    </h3>
                    {video.description ? (
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        {video.description}
                      </p>
                    ) : null}
                    <Button
                      className="mt-4"
                      size="sm"
                      onClick={() =>
                        open({
                          type: 'video',
                          video: {
                            id: video.id,
                            title: video.title,
                            src: resolvedSrc,
                            poster: resolvedPoster || null
                          },
                          source: 'videos'
                        })
                      }
                    >
                      Watch
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {selected ? (
        <VideoModal
          open={Boolean(selected)}
          title={selected.title}
          src={selected.src}
          poster={selected.poster || undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
