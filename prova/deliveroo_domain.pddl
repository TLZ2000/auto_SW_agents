(define (domain default)
    (:requirements :strips)
    
    (:predicates
        (tile ?t) ;; walkable tile
        (me ?me)
        (at ?me ?tile)
        (right ?t1 ?t2) ;; tile t1 is right wrt. t2
        (left ?t1 ?t2) ;; tile t1 is left wrt. t2
        (up ?t1 ?t2) ;; tile t1 is up wrt. t2
        (down ?t1 ?t2) ;; tile t1 is down wrt. t2
        (free ?tile) ;; tile not occupied by other agents
    )
    
    (:action right
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (right ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action left
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (left ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action up
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (up ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )

    (:action down
        :parameters (?me ?from ?to)
        :precondition (and
            (me ?me)
            (at ?me ?from)
            (down ?to ?from)
            (free ?to)
        )
        :effect (and
            (at ?me ?to)
			(not (at ?me ?from))
            (not (free ?to))
            (free ?from)
        )
    )
)
